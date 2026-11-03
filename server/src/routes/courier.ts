import type { App } from '../app.js';
import { HttpError } from '../infra.js';
import { COURIER_ALIVE_S, COURIER_GEO, courierAlive } from '../dispatch.js';
import { Id, Point } from './orders.js';

export async function courierRoutes(app: App) {
  const { db, redis, rt, dispatcher } = app.deps;
  const onlyCourier = async (req: Parameters<App['auth']>[0], reply: Parameters<App['auth']>[1]) => {
    await app.auth(req, reply);
    if (req.me.role !== 'courier') throw new HttpError(403, 'forbidden');
  };

  /** Ҷойгиршавӣ (ҳар ≤60 с, вагарна курьер «офлайн» ҳисоб мешавад) */
  app.post('/courier/location', { preHandler: onlyCourier }, async (req) => {
    const p = Point.parse(req.body);
    await redis.multi().geoadd(COURIER_GEO, p.lon, p.lat, String(req.me.id)).set(courierAlive(req.me.id), '1', 'EX', COURIER_ALIVE_S).exec();
    // Мизоҷ курьери худро дар харита мебинад
    const { rows } = await db.query(`SELECT id, user_id FROM orders WHERE courier_id = $1 AND status IN ('accepted','ready','picked_up')`, [req.me.id]);
    await Promise.all(rows.map((o) => rt.publish(`user:${o.user_id}`, 'courier.location', { orderId: o.id, ...p })));
    return { ok: true };
  });

  /** Хатми смена */
  app.post('/courier/offline', { preHandler: onlyCourier }, async (req) => {
    await redis.multi().zrem(COURIER_GEO, String(req.me.id)).del(courierAlive(req.me.id)).exec();
    return { ok: true };
  });

  /** Пешниҳоди ҷорӣ (барои барқарор кардан баъди қатъи WebSocket) */
  app.get('/courier/offer', { preHandler: onlyCourier }, async (req) => {
    const orderId = await dispatcher.currentOffer(req.me.id);
    if (!orderId) return null;
    const { rows } = await db.query(
      `SELECT o.id AS "orderId", o.address, o.lat, o.lon, o.delivery_fee AS "deliveryFee",
              CASE WHEN o.payment = 'cash' THEN o.total ELSE 0 END AS cash,
              m.name AS "merchantName", m.lat AS m_lat, m.lon AS m_lon
       FROM orders o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`,
      [orderId],
    );
    const r = rows[0];
    if (!r) return null;
    const ttl = await redis.ttl(`offer:${orderId}`);
    return {
      orderId: r.orderId, merchantName: r.merchantName, address: r.address, deliveryFee: r.deliveryFee, cash: r.cash,
      pickup: { lat: r.m_lat, lon: r.m_lon }, dropoff: { lat: r.lat, lon: r.lon }, expiresInS: Math.max(0, ttl),
    };
  });

  app.post('/courier/offers/:id/accept', { preHandler: onlyCourier }, async (req) => {
    const { id } = Id.parse(req.params);
    const o = await dispatcher.accept(id, req.me.id);
    return { ok: true, status: o.status };
  });

  app.post('/courier/offers/:id/decline', { preHandler: onlyCourier }, async (req) => {
    const { id } = Id.parse(req.params);
    await dispatcher.decline(id, req.me.id);
    return { ok: true };
  });
}
