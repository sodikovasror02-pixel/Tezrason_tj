import type { Db, RedisClient } from './infra.js';
import { HttpError } from './infra.js';
import type { Realtime } from './realtime.js';
import type { Router } from './routing.js';
import { DISPATCHABLE, FINAL } from './domain/status.js';
import { etaMinutes } from './domain/eta.js';

export const COURIER_GEO = 'geo:courier';
export const courierAlive = (id: number) => `courier:alive:${id}`;
export const COURIER_ALIVE_S = 60;
/** Курьер барои қабул 30 с дорад, баъд пешниҳод ба курьери навбатӣ меравад */
export const OFFER_TTL_S = 30;

const offerKey = (orderId: number) => `offer:${orderId}`; // → courierId
const offeredSet = (orderId: number) => `offer:tried:${orderId}`; // курьерҳое, ки аллакай пешниҳод гирифтанд
const courierOffer = (courierId: number) => `courier:offer:${courierId}`; // → orderId (як пешниҳод дар як вақт)

type Pt = { lat: number; lon: number };

/**
 * Диспетчер: фармоиши қабулшударо ба курьери наздиктарини озод пешниҳод мекунад.
 *   1) GEOSEARCH аз тарабхона дар радиуси R, ASC;
 *   2) филтр: зинда (≤60 с), бе фармоиши фаъол, бе пешниҳоди дигар, ҳанӯз пешниҳод нагирифта;
 *   3) пешниҳод бо TTL = 30 с; рад ё гузаштани вақт → курьери навбатӣ.
 * tick() ҳар 5 с аз ҷониби як инстансия (қулфи Redis) иҷро мешавад.
 */
export class Dispatcher {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private d: { db: Db; redis: RedisClient; rt: Realtime; router: Router; radiusKm: number }) {}

  start(everyMs = 5000) {
    this.timer = setInterval(() => void this.tick().catch(() => {}), everyMs);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const lock = await this.d.redis.set('dispatch:lock', '1', 'PX', 4000, 'NX');
    if (!lock) return;
    const { rows } = await this.d.db.query(
      `SELECT id FROM orders WHERE status = ANY($1) AND courier_id IS NULL ORDER BY created_at LIMIT 100`,
      [DISPATCHABLE],
    );
    for (const r of rows) await this.offerNext(r.id);
  }

  /** Аз transition() даъват мешавад */
  async onStatus(orderId: number, status: string) {
    if (DISPATCHABLE.includes(status)) await this.offerNext(orderId);
    if (status === 'accepted' || status === 'ready' || status === 'picked_up') await this.updateEta(orderId);
    if (FINAL.includes(status)) await this.clearOffer(orderId);
  }

  async offerNext(orderId: number): Promise<number | null> {
    const { redis, db } = this.d;
    if (await redis.exists(offerKey(orderId))) return null; // пешниҳоди фаъол ҳаст
    const o = (
      await db.query(
        `SELECT o.id, o.courier_id, o.status, o.address, o.lat, o.lon, o.delivery_fee, o.total, o.payment,
                m.name AS merchant_name, m.lat AS m_lat, m.lon AS m_lon
         FROM orders o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`,
        [orderId],
      )
    ).rows[0];
    if (!o || o.courier_id || !DISPATCHABLE.includes(o.status)) return null;

    const cands = await this.freeCouriersNear({ lat: o.m_lat, lon: o.m_lon });
    const tried = new Set((await redis.smembers(offeredSet(orderId))).map(Number));
    let pick = cands.find((c) => !tried.has(c.id));
    if (!pick && cands.length && tried.size) {
      // Ҳама як бор пешниҳод гирифтанд — давраи нав
      await redis.del(offeredSet(orderId));
      pick = cands[0];
    }
    if (!pick) return null;

    // Атомӣ: пешниҳод ба курьере, ки ҳоло пешниҳоди дигар надорад
    const ok = await redis.set(courierOffer(pick.id), String(orderId), 'EX', OFFER_TTL_S, 'NX');
    if (!ok) return null;
    await redis.multi().set(offerKey(orderId), String(pick.id), 'EX', OFFER_TTL_S).sadd(offeredSet(orderId), String(pick.id)).expire(offeredSet(orderId), 1800).exec();

    await this.d.rt.publish(`user:${pick.id}`, 'delivery.offer', {
      orderId,
      merchantName: o.merchant_name,
      pickup: { lat: o.m_lat, lon: o.m_lon },
      dropoff: { lat: o.lat, lon: o.lon },
      address: o.address,
      pickupKm: pick.km,
      deliveryFee: o.delivery_fee,
      cash: o.payment === 'cash' ? o.total : 0,
      expiresInS: OFFER_TTL_S,
    });
    return pick.id;
  }

  async accept(orderId: number, courierId: number) {
    const { redis, db } = this.d;
    const holder = await redis.get(offerKey(orderId));
    if (holder !== String(courierId)) throw new HttpError(409, 'offer_expired');
    const { rows } = await db.query(
      `UPDATE orders SET courier_id = $2, updated_at = now()
       WHERE id = $1 AND courier_id IS NULL AND status = ANY($3) RETURNING id, user_id, merchant_id, status`,
      [orderId, courierId, DISPATCHABLE],
    );
    await this.clearOffer(orderId, courierId);
    if (!rows[0]) throw new HttpError(409, 'already_taken');
    await db.query('INSERT INTO order_events (order_id, status, actor_id) VALUES ($1, $2, $3)', [orderId, 'courier_assigned', courierId]);
    await this.updateEta(orderId);
    const o = rows[0];
    const payload = { orderId, status: o.status, courierAssigned: true };
    await Promise.all([this.d.rt.publish(`user:${o.user_id}`, 'order.status', payload), this.d.rt.publish(`merchant:${o.merchant_id}`, 'order.status', payload)]);
    return o;
  }

  async decline(orderId: number, courierId: number) {
    const holder = await this.d.redis.get(offerKey(orderId));
    if (holder !== String(courierId)) throw new HttpError(409, 'offer_expired');
    await this.clearOffer(orderId, courierId);
    await this.offerNext(orderId);
  }

  /** Пешниҳоди ҷории курьер (агар барнома баъди қатъи пайваст аз нав кушода шавад) */
  async currentOffer(courierId: number): Promise<number | null> {
    const v = await this.d.redis.get(courierOffer(courierId));
    return v ? Number(v) : null;
  }

  private async clearOffer(orderId: number, courierId?: number) {
    const holder = courierId ?? Number(await this.d.redis.get(offerKey(orderId)));
    const m = this.d.redis.multi().del(offerKey(orderId));
    if (holder) m.del(courierOffer(holder));
    await m.exec();
  }

  async freeCouriersNear(p: Pt, limit = 10): Promise<{ id: number; km: number }[]> {
    const { redis, db } = this.d;
    const res = (await redis.geosearch(COURIER_GEO, 'FROMLONLAT', p.lon, p.lat, 'BYRADIUS', this.d.radiusKm, 'km', 'ASC', 'COUNT', 50, 'WITHDIST')) as [string, string][];
    if (!res.length) return [];
    const ids = res.map(([id]) => Number(id));
    const [alive, holding] = await Promise.all([redis.mget(ids.map(courierAlive)), redis.mget(ids.map(courierOffer))]);
    const { rows: busy } = await db.query(`SELECT DISTINCT courier_id FROM orders WHERE courier_id = ANY($1::bigint[]) AND status <> ALL($2)`, [ids, FINAL]);
    const busySet = new Set(busy.map((r) => Number(r.courier_id)));
    return res
      .map(([id, km], i) => ({ id: Number(id), km: Number(km), ok: !!alive[i] && !holding[i] && !busySet.has(Number(id)) }))
      .filter((c) => c.ok)
      .slice(0, limit)
      .map(({ id, km }) => ({ id, km }));
  }

  /** ETA-ро аз нав ҳисоб карда, дар orders.eta_at нигоҳ медорад */
  async updateEta(orderId: number): Promise<Date | null> {
    const { db, redis, router } = this.d;
    const o = (
      await db.query(
        `SELECT o.status, o.courier_id, o.lat, o.lon, o.created_at, m.lat AS m_lat, m.lon AS m_lon, m.prep_min,
                (SELECT created_at FROM order_events e WHERE e.order_id = o.id AND e.status = 'accepted' ORDER BY id LIMIT 1) AS accepted_at
         FROM orders o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`,
        [orderId],
      )
    ).rows[0];
    if (!o || FINAL.includes(o.status)) return null;
    const merchant = { lat: o.m_lat, lon: o.m_lon };
    const customer = { lat: o.lat, lon: o.lon };
    let courierPos: Pt | null = null;
    if (o.courier_id) {
      const pos = (await redis.geopos(COURIER_GEO, String(o.courier_id)))[0];
      if (pos) courierPos = { lon: Number(pos[0]), lat: Number(pos[1]) };
    }

    let minutes: number;
    if (o.status === 'picked_up') {
      minutes = Math.ceil((await router.route(courierPos ?? merchant, customer)).durationMin);
    } else {
      const since = (Date.now() - new Date(o.accepted_at ?? o.created_at).getTime()) / 60000;
      const prepLeftMin = o.status === 'ready' ? 0 : o.prep_min - since;
      const toMerchant = courierPos ? (await router.route(courierPos, merchant)).durationMin : null;
      const toCustomer = (await router.route(merchant, customer)).durationMin;
      minutes = etaMinutes({ prepLeftMin, courierToMerchantMin: toMerchant, merchantToCustomerMin: toCustomer });
    }
    const eta = new Date(Date.now() + minutes * 60000);
    await db.query('UPDATE orders SET eta_at = $2 WHERE id = $1', [orderId, eta]);
    return eta;
  }
}
