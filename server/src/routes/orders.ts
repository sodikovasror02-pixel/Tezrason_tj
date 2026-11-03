import { z } from 'zod';
import type pg from 'pg';
import type { App, Me } from '../app.js';
import { HttpError, tx } from '../infra.js';
import { cartTotals, deliveryFee, haversineKm, surgeAt, taxiFare, Tariff } from '../domain/pricing.js';
import { canTransition, INITIAL, isFinal, OrderKind } from '../domain/status.js';

const Point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const Items = z.array(z.object({ productId: z.number().int(), qty: z.number().int().min(1).max(99) })).min(1).max(50);
const Id = z.object({ id: z.coerce.number().int() });

const DRIVERS_GEO = 'drivers:geo';
const driverAlive = (id: number) => `driver:alive:${id}`;
const DRIVER_ALIVE_S = 60; // ронанда бояд ҳар ≤60 с ҷойгиршавиро фиристад
const ACTIVE_TAXI = ['driver_assigned', 'arrived', 'in_progress'];

type OrderRow = { id: number; kind: OrderKind; status: string; user_id: number; merchant_id: number | null; driver_id: number | null };

/** Ҳамроҳ кардани қаторҳои такрорӣ: [{p1,1},{p1,2}] → [{p1,3}] */
function mergeItems(items: z.infer<typeof Items>) {
  const m = new Map<number, number>();
  for (const i of items) m.set(i.productId, (m.get(i.productId) ?? 0) + i.qty);
  return [...m].map(([productId, qty]) => ({ productId, qty: Math.min(qty, 99) }));
}

export async function orderRoutes(app: App) {
  const { db, redis, rt, cfg, router } = app.deps;

  /** Масир + масофаи мустақим (барои шаффофияти ҳисоб) */
  async function routeFor(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
    const r = await router.route(from, to);
    return { ...r, straightKm: haversineKm(from, to) };
  }

  /** Нархҳоро ҲАМЕША аз база мегирем — ба нархи клиент бовар намекунем */
  async function priceCart(c: pg.PoolClient | typeof db, merchantId: number, items: z.infer<typeof Items>, to: { lat: number; lon: number }) {
    const m = (await c.query('SELECT id, kind, name, lat, lon, is_open FROM merchants WHERE id = $1', [merchantId])).rows[0];
    if (!m) throw new HttpError(404, 'merchant_not_found');
    if (!m.is_open) throw new HttpError(409, 'merchant_closed');
    const merged = mergeItems(items);
    const { rows: prods } = await c.query(
      'SELECT id, name_tj, name_ru, price, available FROM products WHERE merchant_id = $1 AND id = ANY($2::bigint[])',
      [merchantId, merged.map((i) => i.productId)],
    );
    const byId = new Map(prods.map((p) => [Number(p.id), p]));
    const lines = merged.map((i) => {
      const p = byId.get(i.productId);
      if (!p) throw new HttpError(400, 'product_not_in_merchant', `productId ${i.productId}`);
      if (!p.available) throw new HttpError(409, 'product_unavailable', `productId ${i.productId}`);
      return { productId: i.productId, name_tj: p.name_tj, name_ru: p.name_ru, price: p.price as number, qty: i.qty };
    });
    const fee = deliveryFee({ lat: m.lat, lon: m.lon }, to);
    return { merchant: m, lines, totals: cartTotals(lines, fee) };
  }

  async function loadOrder(c: pg.PoolClient | typeof db, id: number, lock = false): Promise<OrderRow> {
    const { rows } = await c.query(
      `SELECT id, kind, status, user_id, merchant_id, driver_id FROM orders WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'order_not_found');
    return { ...rows[0], id: Number(rows[0].id), user_id: Number(rows[0].user_id), merchant_id: rows[0].merchant_id && Number(rows[0].merchant_id), driver_id: rows[0].driver_id && Number(rows[0].driver_id) };
  }

  function canSee(me: Me, o: OrderRow): boolean {
    if (me.role === 'admin') return true;
    if (o.user_id === me.id) return true;
    if (me.role === 'merchant' && o.merchant_id === me.merchant_id) return true;
    if ((me.role === 'driver' || me.role === 'courier') && o.driver_id === me.id) return true;
    return false;
  }

  /** Огоҳ кардани ҳамаи тарафҳо дар бораи тағйирот */
  async function notify(o: OrderRow, status: string) {
    const payload = { orderId: o.id, kind: o.kind, status };
    const jobs = [rt.publish(`user:${o.user_id}`, 'order.status', payload)];
    if (o.merchant_id) jobs.push(rt.publish(`merchant:${o.merchant_id}`, 'order.status', payload));
    if (o.driver_id) jobs.push(rt.publish(`user:${o.driver_id}`, 'order.status', payload));
    await Promise.all(jobs);
  }

  async function logEvent(c: pg.PoolClient, orderId: number, status: string, actorId: number) {
    await c.query('INSERT INTO order_events (order_id, status, actor_id) VALUES ($1, $2, $3)', [orderId, status, actorId]);
  }

  /** Ронандаҳои озод дар радиуси R аз нуқта (Redis GEOSEARCH), наздиктарин аввал */
  async function nearbyFreeDrivers(p: { lat: number; lon: number }, limit = 10): Promise<{ id: number; km: number }[]> {
    const res = (await redis.geosearch(DRIVERS_GEO, 'FROMLONLAT', p.lon, p.lat, 'BYRADIUS', cfg.dispatchRadiusKm, 'km', 'ASC', 'COUNT', 50, 'WITHDIST')) as [string, string][];
    if (!res.length) return [];
    const ids = res.map(([id]) => Number(id));
    const alive = await redis.mget(ids.map(driverAlive));
    const { rows: busy } = await db.query(
      'SELECT DISTINCT driver_id FROM orders WHERE kind = $1 AND status = ANY($2) AND driver_id = ANY($3::bigint[])',
      ['taxi', ACTIVE_TAXI, ids],
    );
    const busySet = new Set(busy.map((r) => Number(r.driver_id)));
    return res
      .map(([id, km], i) => ({ id: Number(id), km: Number(km), alive: alive[i] }))
      .filter((d) => d.alive && !busySet.has(d.id))
      .slice(0, limit)
      .map(({ id, km }) => ({ id, km }));
  }

  // ───────────── Хӯрок / Маркет ─────────────

  app.post('/quotes/cart', { preHandler: app.auth }, async (req) => {
    const b = z.object({ merchantId: z.number().int(), items: Items, to: Point }).parse(req.body);
    const { lines, totals } = await priceCart(db, b.merchantId, b.items, b.to);
    return { lines, ...totals };
  });

  app.post('/orders', { preHandler: app.auth }, async (req, reply) => {
    const b = z
      .object({
        merchantId: z.number().int(),
        items: Items,
        address: z.string().trim().min(3).max(200),
        to: Point,
        payment: z.enum(['cash', 'card']),
      })
      .parse(req.body);

    const order = await tx(db, async (c) => {
      const { merchant, lines, totals } = await priceCart(c, b.merchantId, b.items, b.to);
      const kind: OrderKind = merchant.kind === 'market' ? 'market' : 'food';
      const status = INITIAL[kind];
      const { rows } = await c.query(
        `INSERT INTO orders (user_id, kind, status, merchant_id, address, lat, lon, payment, subtotal, delivery_fee, service_fee, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [req.me.id, kind, status, b.merchantId, b.address, b.to.lat, b.to.lon, b.payment, totals.subtotal, totals.deliveryFee, totals.serviceFee, totals.total],
      );
      const o = rows[0];
      for (const l of lines)
        await c.query('INSERT INTO order_items (order_id, product_id, name_tj, name_ru, price, qty) VALUES ($1,$2,$3,$4,$5,$6)', [o.id, l.productId, l.name_tj, l.name_ru, l.price, l.qty]);
      await logEvent(c, o.id, status, req.me.id);
      return { ...o, items: lines };
    });

    await rt.publish(`merchant:${b.merchantId}`, 'order.new', { orderId: Number(order.id) });
    return reply.code(201).send(order);
  });

  // ───────────── Такси ─────────────

  app.post('/quotes/taxi', async (req) => {
    const b = z.object({ from: Point, to: Point }).parse(req.body);
    const tariffs = (await db.query<Tariff>('SELECT id, base, per_km, per_min, min_fare FROM tariffs ORDER BY base')).rows;
    const surge = surgeAt(new Date());
    const route = await routeFor(b.from, b.to);
    return { route, quotes: tariffs.map((t) => taxiFare(route, t, surge)) };
  });

  app.post('/rides', { preHandler: app.auth }, async (req, reply) => {
    const b = z
      .object({
        from: Point,
        to: Point,
        fromName: z.string().max(120).optional(),
        toName: z.string().max(120).optional(),
        tariffId: z.string(),
        payment: z.enum(['cash', 'card']),
      })
      .parse(req.body);
    const t = (await db.query<Tariff>('SELECT id, base, per_km, per_min, min_fare FROM tariffs WHERE id = $1', [b.tariffId])).rows[0];
    if (!t) throw new HttpError(400, 'tariff_not_found');
    if (haversineKm(b.from, b.to) < 0.2) throw new HttpError(400, 'ride_too_short');
    const route = await routeFor(b.from, b.to);
    const q = taxiFare(route, t, surgeAt(new Date()));

    const order = await tx(db, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO orders (user_id, kind, status, address, lat, lon, payment, total)
         VALUES ($1,'taxi',$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.me.id, INITIAL.taxi, b.toName ?? null, b.to.lat, b.to.lon, b.payment, q.total],
      );
      const o = rows[0];
      await c.query(
        `INSERT INTO rides (order_id, tariff_id, from_lat, from_lon, to_lat, to_lon, from_name, to_name, route_km, minutes, surge)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [o.id, t.id, b.from.lat, b.from.lon, b.to.lat, b.to.lon, b.fromName ?? null, b.toName ?? null, q.routeKm.toFixed(3), q.minutes.toFixed(2), q.surge],
      );
      await logEvent(c, o.id, INITIAL.taxi, req.me.id);
      return o;
    });

    // Диспетчеризатсия: пешниҳод ба ронандаҳои наздик (аввалин қабулкунанда мегирад)
    const drivers = await nearbyFreeDrivers(b.from);
    await Promise.all(
      drivers.map((d) =>
        rt.publish(`user:${d.id}`, 'ride.offer', { orderId: Number(order.id), pickupKm: d.km, from: b.from, to: b.to, total: q.total, tariffId: t.id }),
      ),
    );
    return reply.code(201).send({ ...order, quote: q, route, offeredTo: drivers.length });
  });

  // ───────────── Ронанда / Курьер ─────────────

  app.post('/drivers/location', { preHandler: app.auth }, async (req) => {
    if (req.me.role !== 'driver' && req.me.role !== 'courier') throw new HttpError(403, 'forbidden');
    const p = Point.parse(req.body);
    await redis.multi().geoadd(DRIVERS_GEO, p.lon, p.lat, String(req.me.id)).set(driverAlive(req.me.id), '1', 'EX', DRIVER_ALIVE_S).exec();
    // Агар дар сафар бошад — ба мизоҷ ҷойгиршавиро мефиристем
    const { rows } = await db.query(
      `SELECT id, user_id FROM orders WHERE driver_id = $1 AND status = ANY($2)`,
      [req.me.id, [...ACTIVE_TAXI, 'picked_up']],
    );
    await Promise.all(rows.map((o) => rt.publish(`user:${o.user_id}`, 'driver.location', { orderId: Number(o.id), ...p })));
    return { ok: true };
  });

  /** Фармоишҳои озод барои ронанда (такси дар радиус) ё курьер (омода/қабулшуда) */
  app.get('/jobs', { preHandler: app.auth }, async (req) => {
    if (req.me.role === 'courier') {
      const { rows } = await db.query(
        `SELECT o.id, o.kind, o.status, o.address, o.total, o.delivery_fee, m.name AS merchant_name, m.lat AS merchant_lat, m.lon AS merchant_lon
         FROM orders o JOIN merchants m ON m.id = o.merchant_id
         WHERE o.kind IN ('food','market') AND o.status IN ('accepted','ready') AND o.driver_id IS NULL
         ORDER BY o.created_at LIMIT 50`,
      );
      return rows;
    }
    if (req.me.role === 'driver') {
      const pos = (await redis.geopos(DRIVERS_GEO, String(req.me.id)))[0];
      if (!pos) throw new HttpError(409, 'location_unknown', 'Аввал POST /drivers/location');
      const [lon, lat] = pos.map(Number);
      const { rows } = await db.query(
        `SELECT o.id, o.total, r.* FROM orders o JOIN rides r ON r.order_id = o.id
         WHERE o.status = 'searching' ORDER BY o.created_at LIMIT 100`,
      );
      return rows
        .map((r) => ({ ...r, pickupKm: haversineKm({ lat, lon }, { lat: r.from_lat, lon: r.from_lon }) }))
        .filter((r) => r.pickupKm <= cfg.dispatchRadiusKm)
        .sort((a, b) => a.pickupKm - b.pickupKm);
    }
    throw new HttpError(403, 'forbidden');
  });

  /**
   * Гирифтани фармоиш. Атомӣ: `UPDATE … WHERE driver_id IS NULL` —
   * агар ду ронанда ҳамзамон пахш кунанд, танҳо яке мегирад (дигаре 409).
   */
  app.post('/orders/:id/claim', { preHandler: app.auth }, async (req) => {
    const { id } = Id.parse(req.params);
    const me = req.me;
    const o = await loadOrder(db, id);

    if (o.kind === 'taxi') {
      if (me.role !== 'driver') throw new HttpError(403, 'forbidden');
      const active = await db.query('SELECT 1 FROM orders WHERE driver_id = $1 AND kind = $2 AND status = ANY($3)', [me.id, 'taxi', ACTIVE_TAXI]);
      if (active.rowCount) throw new HttpError(409, 'driver_busy');
      const updated = await tx(db, async (c) => {
        const { rows } = await c.query(
          `UPDATE orders SET driver_id = $2, status = 'driver_assigned', updated_at = now()
           WHERE id = $1 AND status = 'searching' AND driver_id IS NULL RETURNING id`,
          [id, me.id],
        );
        if (!rows[0]) return null;
        await logEvent(c, id, 'driver_assigned', me.id);
        return rows[0];
      });
      if (!updated) throw new HttpError(409, 'already_taken');
      await notify({ ...o, driver_id: me.id }, 'driver_assigned');
      return { ok: true, status: 'driver_assigned' };
    }

    if (me.role !== 'courier') throw new HttpError(403, 'forbidden');
    const { rows } = await db.query(
      `UPDATE orders SET driver_id = $2, updated_at = now()
       WHERE id = $1 AND status IN ('accepted','ready') AND driver_id IS NULL RETURNING id, status`,
      [id, me.id],
    );
    if (!rows[0]) throw new HttpError(409, 'already_taken');
    await notify({ ...o, driver_id: me.id }, rows[0].status);
    return { ok: true, status: rows[0].status };
  });

  // ───────────── Умумӣ ─────────────

  app.get('/orders', { preHandler: app.auth }, async (req) => {
    const me = req.me;
    const where =
      me.role === 'merchant' ? 'o.merchant_id = $1' : me.role === 'driver' || me.role === 'courier' ? 'o.driver_id = $1' : me.role === 'admin' ? '$1::bigint IS NOT NULL' : 'o.user_id = $1';
    const arg = me.role === 'merchant' ? me.merchant_id : me.id;
    const { rows } = await db.query(
      `SELECT o.*, m.name AS merchant_name, r.from_name, r.to_name, r.tariff_id
       FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id LEFT JOIN rides r ON r.order_id = o.id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`,
      [arg],
    );
    return rows;
  });

  app.get('/orders/:id', { preHandler: app.auth }, async (req) => {
    const { id } = Id.parse(req.params);
    const o = await loadOrder(db, id);
    if (!canSee(req.me, o)) throw new HttpError(404, 'order_not_found'); // 404, на 403 — мавҷудиятро ошкор намекунем
    const [full, items, ride, events] = await Promise.all([
      db.query('SELECT * FROM orders WHERE id = $1', [id]),
      db.query('SELECT product_id, name_tj, name_ru, price, qty FROM order_items WHERE order_id = $1', [id]),
      db.query('SELECT * FROM rides WHERE order_id = $1', [id]),
      db.query('SELECT status, actor_id, created_at FROM order_events WHERE order_id = $1 ORDER BY id', [id]),
    ]);
    let driverLocation = null;
    if (o.driver_id && !isFinal(o.kind, o.status)) {
      const pos = (await redis.geopos(DRIVERS_GEO, String(o.driver_id)))[0];
      if (pos) driverLocation = { lon: Number(pos[0]), lat: Number(pos[1]) };
    }
    const r = ride.rows[0];
    const route = r ? await router.route({ lat: r.from_lat, lon: r.from_lon }, { lat: r.to_lat, lon: r.to_lon }) : null;
    return { ...full.rows[0], items: items.rows, ride: r ? { ...r, geometry: route!.geometry, routeSource: route!.source } : null, events: events.rows, driverLocation };
  });

  app.post('/orders/:id/status', { preHandler: app.auth }, async (req) => {
    const { id } = Id.parse(req.params);
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const me = req.me;

    const o = await tx(db, async (c) => {
      const o = await loadOrder(c, id, true); // FOR UPDATE — ҳимоя аз race condition
      if (!canSee(me, o)) throw new HttpError(404, 'order_not_found');
      // Ронанда/курьер танҳо фармоиши ба худ гирифтаро идора мекунад
      if ((me.role === 'driver' || me.role === 'courier') && o.driver_id !== me.id) throw new HttpError(403, 'forbidden');
      if (!canTransition(o.kind, o.status, status, me.role)) throw new HttpError(409, 'invalid_transition', `${o.status} → ${status} (${me.role})`);
      await c.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
      await logEvent(c, id, status, me.id);
      return o;
    });
    await notify(o, status);
    return { ok: true, status };
  });
}
