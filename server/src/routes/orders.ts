import { z } from 'zod';
import type pg from 'pg';
import type { App } from '../app.js';
import { HttpError, tx } from '../infra.js';
import { cartTotals, deliveryFeeByKm, haversineKm } from '../domain/pricing.js';
import { etaMinutes } from '../domain/eta.js';
import { initialStatus, isFinal, OrderKind } from '../domain/status.js';
import { COURIER_GEO } from '../dispatch.js';
import { canSee, loadOrder, logEvent, transition } from '../orders-core.js';

export const Point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const Items = z.array(z.object({ productId: z.number().int(), qty: z.number().int().min(1).max(99) })).min(1).max(50);
export const Id = z.object({ id: z.coerce.number().int() });
const opt = (n: number) => z.string().trim().max(n).optional().nullable();
export const AddressInput = Point.extend({
  text: z.string().trim().min(3).max(200),
  entrance: opt(20),
  floor: opt(20),
  apartment: opt(20),
  comment: opt(300),
});

/** Ҳамроҳ кардани қаторҳои такрорӣ: [{p1,1},{p1,2}] → [{p1,3}] */
function mergeItems(items: z.infer<typeof Items>) {
  const m = new Map<number, number>();
  for (const i of items) m.set(i.productId, (m.get(i.productId) ?? 0) + i.qty);
  return [...m].map(([productId, qty]) => ({ productId, qty: Math.min(qty, 99) }));
}

export async function orderRoutes(app: App) {
  const deps = app.deps;
  const { db, redis, router, payments } = deps;

  /**
   * Нарх ва санҷишҳо — ҲАМЕША аз база (ба нархи клиент бовар намекунем):
   *  • тарабхона кушода; маҳсулот аз ҳамин тарабхона ва дар ҳаст;
   *  • минтақа: d₀ (хати рост) ≤ R_тарабхона;
   *  • ҳадди ақали фармоиш: subtotal ≥ min_order;
   *  • расонидан аз масофаи роҳ (OSRM ё тахмин).
   */
  async function priceCart(c: pg.PoolClient | typeof db, merchantId: number, items: z.infer<typeof Items>, to: { lat: number; lon: number }) {
    const m = (await c.query('SELECT id, kind, name, lat, lon, is_open, prep_min, delivery_radius_km, min_order FROM merchants WHERE id = $1', [merchantId])).rows[0];
    if (!m) throw new HttpError(404, 'merchant_not_found');
    if (!m.is_open) throw new HttpError(409, 'merchant_closed');
    const straightKm = haversineKm({ lat: m.lat, lon: m.lon }, to);
    if (straightKm > Number(m.delivery_radius_km)) throw new HttpError(409, 'out_of_zone', `${straightKm.toFixed(1)} > ${m.delivery_radius_km} км`);

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

    const route = await router.route({ lat: m.lat, lon: m.lon }, to);
    const totals = cartTotals(lines, deliveryFeeByKm(route.distanceKm));
    if (totals.subtotal < m.min_order) throw new HttpError(409, 'below_min_order', `${totals.subtotal} < ${m.min_order}`);
    const etaMin = etaMinutes({ prepLeftMin: m.prep_min, courierToMerchantMin: null, merchantToCustomerMin: route.durationMin });
    return { merchant: m, lines, totals, routeKm: route.distanceKm, etaMin };
  }

  app.post('/quotes/cart', { preHandler: app.auth }, async (req) => {
    const b = z.object({ merchantId: z.number().int(), items: Items, to: Point }).parse(req.body);
    const { lines, totals, routeKm, etaMin } = await priceCart(db, b.merchantId, b.items, b.to);
    return { lines, ...totals, routeKm, etaMin };
  });

  app.post('/orders', { preHandler: app.auth }, async (req, reply) => {
    const b = z
      .object({ merchantId: z.number().int(), items: Items, address: AddressInput, payment: z.enum(['cash', 'card']) })
      .parse(req.body);
    const a = b.address;

    const order = await tx(db, async (c) => {
      const { merchant, lines, totals, routeKm, etaMin } = await priceCart(c, b.merchantId, b.items, a);
      const kind: OrderKind = merchant.kind === 'market' ? 'market' : 'food';
      const status = initialStatus(b.payment);
      const { rows } = await c.query(
        `INSERT INTO orders (user_id, kind, status, merchant_id, address, lat, lon, entrance, floor, apartment, comment,
                             payment, payment_status, subtotal, delivery_fee, service_fee, total, route_km, eta_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now() + make_interval(mins => $19))
         RETURNING *`,
        [req.me.id, kind, status, b.merchantId, a.text, a.lat, a.lon, a.entrance ?? null, a.floor ?? null, a.apartment ?? null, a.comment ?? null,
         b.payment, b.payment === 'card' ? 'pending' : 'none', totals.subtotal, totals.deliveryFee, totals.serviceFee, totals.total, routeKm.toFixed(2), etaMin],
      );
      const o = rows[0];
      for (const l of lines)
        await c.query('INSERT INTO order_items (order_id, product_id, name_tj, name_ru, price, qty) VALUES ($1,$2,$3,$4,$5,$6)', [o.id, l.productId, l.name_tj, l.name_ru, l.price, l.qty]);
      await logEvent(c, o.id, status, req.me.id);
      return { ...o, items: lines };
    });

    if (b.payment === 'cash') {
      await deps.rt.publish(`merchant:${b.merchantId}`, 'order.new', { orderId: order.id });
      return reply.code(201).send(order);
    }

    // Корт: сессияи пардохт; тарабхона фармоишро танҳо баъди тасдиқи бонк мебинад
    try {
      const p = await payments.createPayment({ orderId: order.id, amount: order.total });
      await db.query(`INSERT INTO payments (order_id, provider, provider_ref, amount, status) VALUES ($1,$2,$3,$4,'pending')`, [order.id, payments.name, p.ref, order.total]);
      return reply.code(201).send({ ...order, checkoutUrl: p.checkoutUrl });
    } catch {
      await transition(deps, order.id, 'cancelled', 'system', null);
      throw new HttpError(502, 'payment_unavailable');
    }
  });

  app.get('/orders', { preHandler: app.auth }, async (req) => {
    const me = req.me;
    const { active } = z.object({ active: z.enum(['1']).optional() }).parse(req.query);
    let where: string;
    let arg: number | null;
    if (me.role === 'merchant') [where, arg] = [`o.merchant_id = $1 AND o.status <> 'awaiting_payment'`, me.merchant_id];
    else if (me.role === 'courier') [where, arg] = ['o.courier_id = $1', me.id];
    else if (me.role === 'admin') [where, arg] = ['$1::bigint IS NOT NULL', me.id];
    else [where, arg] = ['o.user_id = $1', me.id];
    if (active) where += ` AND o.status NOT IN ('delivered','cancelled')`;
    const { rows } = await db.query(
      `SELECT o.*, m.name AS merchant_name,
              COALESCE((SELECT json_agg(json_build_object('product_id', i.product_id, 'name_tj', i.name_tj, 'name_ru', i.name_ru, 'price', i.price, 'qty', i.qty))
                        FROM order_items i WHERE i.order_id = o.id), '[]') AS items
       FROM orders o JOIN merchants m ON m.id = o.merchant_id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`,
      [arg],
    );
    return rows;
  });

  app.get('/orders/:id', { preHandler: app.auth }, async (req) => {
    const { id } = Id.parse(req.params);
    const o = await loadOrder(db, id);
    if (!canSee(req.me, o)) throw new HttpError(404, 'order_not_found'); // 404, на 403 — мавҷудиятро ошкор намекунем
    const [full, items, events, pay] = await Promise.all([
      db.query(
        `SELECT o.*, m.name AS merchant_name, m.lat AS merchant_lat, m.lon AS merchant_lon, u.name AS courier_name, u.phone AS courier_phone
         FROM orders o JOIN merchants m ON m.id = o.merchant_id LEFT JOIN users u ON u.id = o.courier_id WHERE o.id = $1`,
        [id],
      ),
      db.query('SELECT product_id, name_tj, name_ru, price, qty FROM order_items WHERE order_id = $1', [id]),
      db.query('SELECT status, actor_id, created_at FROM order_events WHERE order_id = $1 ORDER BY id', [id]),
      db.query(`SELECT provider_ref FROM payments WHERE order_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1`, [id]),
    ]);
    let courierLocation = null;
    if (o.courier_id && !isFinal(o.status)) {
      const pos = (await redis.geopos(COURIER_GEO, String(o.courier_id)))[0];
      if (pos) courierLocation = { lon: Number(pos[0]), lat: Number(pos[1]) };
    }
    const r = full.rows[0];
    // Телефони курьер танҳо ба мизоҷ ва танҳо то расонидан
    if (req.me.id !== o.user_id || isFinal(o.status)) delete r.courier_phone;
    const checkoutUrl = o.user_id === req.me.id && o.status === 'awaiting_payment' && pay.rows[0] ? `${deps.cfg.publicUrl}/payments/mock/${pay.rows[0].provider_ref}` : null;
    return { ...r, items: items.rows, events: events.rows, courierLocation, checkoutUrl };
  });

  /** Тағйири ҳолат: мизоҷ (бекор), тарабхона (қабул/омода/бекор), курьер (гирифт/расонд) */
  app.post('/orders/:id/status', { preHandler: app.auth }, async (req) => {
    const { id } = Id.parse(req.params);
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const me = req.me;
    await transition(deps, id, status, me.role, me.id, (o) => {
      if (!canSee(me, o)) throw new HttpError(404, 'order_not_found');
      // Мизоҷ танҳо ҳамчун мизоҷ; курьер танҳо фармоиши ба худ таъиншуда
      if (me.role === 'courier' && o.courier_id !== me.id) throw new HttpError(403, 'forbidden');
      if (me.role === 'customer' && o.user_id !== me.id) throw new HttpError(404, 'order_not_found');
    });
    return { ok: true, status };
  });
}
