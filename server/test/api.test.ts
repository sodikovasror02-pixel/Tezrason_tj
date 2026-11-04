import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp, App } from '../src/app.js';
import { createDb, createRedis, Db, loadConfig, migrate, RedisClient } from '../src/infra.js';
import { Realtime } from '../src/realtime.js';
import { ConsoleSms } from '../src/sms.js';
import { cartTotals, deliveryFeeByKm, haversineKm } from '../src/domain/pricing.js';
import { etaMinutes } from '../src/domain/eta.js';
import { EstimateRouter } from '../src/routing.js';
import { MockPayments, sign } from '../src/payments.js';
import { Dispatcher } from '../src/dispatch.js';

const ADMIN = '+992900000001';
const SECRET = 'test-webhook-secret';
const HOME = { lat: 38.5781, lon: 68.7838 }; // d₀ ≈ 0.58 км аз Ошхонаи Роҳат
const FAR = { lat: 38.45, lon: 68.6 }; // ~21 км — берун аз минтақа
const addr = (p = HOME) => ({ text: 'хиёб. Рӯдакӣ 45', ...p, entrance: '2', floor: '4', apartment: '17', comment: 'занг занед' });

let app: App, db: Db, redis: RedisClient, sub: RedisClient, base: string, dispatcher: Dispatcher, payments: MockPayments;
const sms = new ConsoleSms();

beforeAll(async () => {
  const cfg = { ...loadConfig({ ADMIN_PHONES: ADMIN, NODE_ENV: 'test' }), databaseUrl: 'postgres://hizmat:hizmat@localhost:5432/hizmat_test', redisUrl: 'redis://localhost:6379/15', paymentWebhookSecret: SECRET };
  db = createDb(cfg.databaseUrl);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  redis = createRedis(cfg.redisUrl);
  await redis.flushdb();
  sub = createRedis(cfg.redisUrl);
  const rt = new Realtime(redis, sub);
  await rt.start();
  const router = new EstimateRouter();
  payments = new MockPayments(cfg.publicUrl, SECRET);
  dispatcher = new Dispatcher({ db, redis, rt, router, radiusKm: 5 }); // tick() дастӣ — бе таймер
  app = await buildApp({ cfg, db, redis, rt, sms, router, payments, dispatcher });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `127.0.0.1:${(app.server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await app.close();
  await db.end();
  redis.disconnect();
  sub.disconnect();
});

// ── ёрирасонҳо ──
async function call(method: string, url: string, token?: string, body?: unknown) {
  const r = await app.inject({ method: method as 'GET', url, payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  let parsed: any = null;
  try {
    parsed = r.body ? JSON.parse(r.body) : null;
  } catch {
    parsed = r.body;
  }
  return { status: r.statusCode, body: parsed };
}
let phoneSeq = 0;
async function login(phone = `+99293${String(1000000 + phoneSeq++).slice(-7)}`) {
  const r1 = await call('POST', '/auth/otp/request', undefined, { phone });
  expect(r1.status).toBe(200);
  const r2 = await call('POST', '/auth/otp/verify', undefined, { phone, code: r1.body.devCode });
  expect(r2.status).toBe(200);
  return { token: r2.body.token as string, id: Number(r2.body.user.id) };
}
let adminToken: string;
async function userWithRole(role: string, merchantId?: number) {
  adminToken ??= (await login(ADMIN)).token;
  const u = await login();
  expect((await call('PATCH', `/admin/users/${u.id}`, adminToken, { role, merchantId })).status).toBe(200);
  return u;
}
type Ws = { ws: WebSocket; next: (event: string, ms?: number) => Promise<any>; none: (event: string, ms?: number) => Promise<void> };
function openWs(token: string): Promise<Ws> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws?token=${token}`);
    const queue: any[] = [];
    const waiters: { event: string; fn: (d: any) => void }[] = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      const i = waiters.findIndex((w) => w.event === m.event);
      if (i >= 0) waiters.splice(i, 1)[0].fn(m.data);
      else queue.push(m);
      if (m.event === 'hello') resolve({ ws, next, none });
    });
    ws.on('error', reject);
    function next(event: string, ms = 3000) {
      const i = queue.findIndex((m) => m.event === event);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0].data);
      return new Promise((res, rej) => {
        waiters.push({ event, fn: res });
        setTimeout(() => rej(new Error(`timeout waiting ${event}`)), ms);
      });
    }
    async function none(event: string, ms = 300) {
      await new Promise((r) => setTimeout(r, ms));
      expect(queue.filter((m) => m.event === event)).toEqual([]);
    }
  });
}
async function menuIds(merchantId: number) {
  const m = (await call('GET', `/merchants/${merchantId}`)).body;
  return Object.fromEntries(m.products.map((p: any) => [p.name_tj, p.id])) as Record<string, number>;
}
async function placeOrder(token: string, payment: 'cash' | 'card' = 'cash') {
  const ids = await menuIds(1);
  return call('POST', '/orders', token, { merchantId: 1, items: [{ productId: ids['Оши палов'], qty: 1 }], address: addr(), payment });
}

beforeEach(async () => {
  // Ҳар тест бо курьерҳо ва ҳолати тарабхонаи «тоза»
  await redis.del('geo:courier');
  await db.query(`UPDATE merchants SET is_open = true, min_order = CASE WHEN kind = 'restaurant' THEN 2000 ELSE 0 END`);
});

// ── тестҳо ──
describe('ҳисобҳо', () => {
  it('расонидан: max(700, round₁₀₀(500 + 150·d))', () => {
    expect(deliveryFeeByKm(0.5)).toBe(700); // 575 → 600 < 700
    expect(deliveryFeeByKm(4)).toBe(1100); // 500 + 600
    expect(deliveryFeeByKm(6.99)).toBe(1500); // 1548.5 → 1500
  });
  it('сабад: хизматрасонӣ 5 %', () => {
    expect(cartTotals([{ price: 3500, qty: 2 }], 700)).toEqual({ subtotal: 7000, deliveryFee: 700, serviceFee: 350, total: 8050 });
  });
  it('ETA = max(t_омода, t_курьер) + 3 + t_роҳ', () => {
    expect(etaMinutes({ prepLeftMin: 25, courierToMerchantMin: null, merchantToCustomerMin: 4 })).toBe(32); // 25 + 3 + 4
    expect(etaMinutes({ prepLeftMin: 2, courierToMerchantMin: null, merchantToCustomerMin: 4 })).toBe(17); // ҷустуҷӯи курьер 10
    expect(etaMinutes({ prepLeftMin: -5, courierToMerchantMin: 6.2, merchantToCustomerMin: 4 })).toBe(14); // ceil(6.2 + 3 + 4)
  });
  it('haversine: Озодӣ → Фурудгоҳ ≈ 5.38 км', () => {
    expect(haversineKm({ lat: 38.5762, lon: 68.7797 }, { lat: 38.5433, lon: 68.825 })).toBeCloseTo(5.38, 2);
  });
});

describe('auth', () => {
  it('рамзи нодуруст → 400, такрори зуд → 429, рақами нодуруст → 400', async () => {
    const phone = '+992911111111';
    const r1 = await call('POST', '/auth/otp/request', undefined, { phone });
    const wrong = r1.body.devCode === '000000' ? '111111' : '000000';
    expect((await call('POST', '/auth/otp/verify', undefined, { phone, code: wrong })).status).toBe(400);
    expect((await call('POST', '/auth/otp/request', undefined, { phone })).status).toBe(429);
    expect((await call('POST', '/auth/otp/request', undefined, { phone: '+7999' })).status).toBe(400);
    expect(sms.sent.at(-1)?.text).toContain(r1.body.devCode);
    expect((await call('POST', '/auth/otp/verify', undefined, { phone, code: r1.body.devCode })).status).toBe(200);
  });
  it('бе токен → 401; нақши driver дигар нест', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    adminToken ??= (await login(ADMIN)).token;
    const u = await login();
    expect((await call('PATCH', `/admin/users/${u.id}`, adminToken, { role: 'driver' })).status).toBe(400);
  });
  it('такси нест: /rides, /quotes/taxi, /tariffs → 404', async () => {
    const u = await login();
    expect((await call('POST', '/rides', u.token, {})).status).toBe(404);
    expect((await call('POST', '/quotes/taxi', undefined, {})).status).toBe(404);
    expect((await call('GET', '/tariffs')).status).toBe(404);
  });
});

describe('нарх, минтақа, ҳадди ақал', () => {
  it('quote: нарх, масофа ва ETA аз сервер', async () => {
    const u = await login();
    const ids = await menuIds(1);
    const q = (await call('POST', '/quotes/cart', u.token, { merchantId: 1, items: [{ productId: ids['Оши палов'], qty: 2 }], to: HOME })).body;
    // d₀ = √(0.534² + 0.226²) = 0.580 км → d = 1.3·d₀ = 0.754 км → 500 + 113 = 613 → 600 < 700 → 700
    expect(q).toMatchObject({ subtotal: 7000, deliveryFee: 700, serviceFee: 350, total: 8050 });
    expect(q.routeKm).toBeCloseTo(0.754, 2);
    expect(q.etaMin).toBe(30); // ⌈25 + 3 + 0.754/25·60 = 29.81⌉
  });
  it('берун аз минтақа → 409 out_of_zone; кам аз ҳадди ақал → 409 below_min_order', async () => {
    const u = await login();
    const ids = await menuIds(1);
    expect((await call('POST', '/quotes/cart', u.token, { merchantId: 1, items: [{ productId: ids['Оши палов'], qty: 1 }], to: FAR })).body.error).toBe('out_of_zone');
    expect((await call('POST', '/quotes/cart', u.token, { merchantId: 1, items: [{ productId: ids['Самбӯса'], qty: 1 }], to: HOME })).body.error).toBe('below_min_order');
  });
});

describe('суроғаҳо', () => {
  it('CRUD ва ҷудоӣ байни корбарон', async () => {
    const a = await login();
    const b = await login();
    const r = await call('POST', '/addresses', a.token, { label: 'Хона', ...addr() });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ label: 'Хона', text: 'хиёб. Рӯдакӣ 45', entrance: '2', floor: '4', apartment: '17' });
    expect((await call('GET', '/addresses', a.token)).body).toHaveLength(1);
    expect((await call('GET', '/addresses', b.token)).body).toHaveLength(0);
    expect((await call('DELETE', `/addresses/${r.body.id}`, b.token)).status).toBe(404);
    expect((await call('DELETE', `/addresses/${r.body.id}`, a.token)).status).toBe(200);
    expect((await call('POST', '/addresses', a.token, { label: '', ...addr() })).status).toBe(400);
  });
});

describe('панели тарабхона', () => {
  it('пӯшидан, маҳсулот, нарх; тарабхонаи бегона дастрасӣ надорад', async () => {
    const m1 = await userWithRole('merchant', 1);
    const m3 = await userWithRole('merchant', 3);
    const u = await login();
    const me = (await call('GET', '/merchant', m1.token)).body;
    expect(me.name).toBe('Ошхонаи Роҳат');
    const plov = me.products.find((p: any) => p.name_tj === 'Оши палов');

    // Нарх иваз шуд → quote-и нав нархи навро мегирад; фармоиши пешина — не
    const old = await placeOrder(u.token);
    expect((await call('PATCH', `/merchant/products/${plov.id}`, m1.token, { price: 4000 })).body.price).toBe(4000);
    const q = (await call('POST', '/quotes/cart', u.token, { merchantId: 1, items: [{ productId: plov.id, qty: 1 }], to: HOME })).body;
    expect(q.subtotal).toBe(4000);
    expect((await call('GET', `/orders/${old.body.id}`, u.token)).body.items[0].price).toBe(3500);
    await call('PATCH', `/merchant/products/${plov.id}`, m1.token, { price: 3500 });

    // Тарабхонаи 3 маҳсулоти 1-ро иваз карда наметавонад
    expect((await call('PATCH', `/merchant/products/${plov.id}`, m3.token, { price: 100 })).status).toBe(404);
    expect((await call('GET', '/merchant', u.token)).status).toBe(403);

    // Тамом шуд → фармоиш 409
    await call('PATCH', `/merchant/products/${plov.id}`, m1.token, { available: false });
    expect((await placeOrder(u.token)).body.error).toBe('product_unavailable');
    await call('PATCH', `/merchant/products/${plov.id}`, m1.token, { available: true });

    // Пӯшида → 409
    expect((await call('PATCH', '/merchant', m1.token, { is_open: false })).body.is_open).toBe(false);
    expect((await placeOrder(u.token)).body.error).toBe('merchant_closed');
    await call('PATCH', '/merchant', m1.token, { is_open: true });

    // Маҳсулоти нав
    const np = await call('POST', '/merchant/products', m1.token, { name_tj: 'Шӯрбо', name_ru: 'Шурпа', price: 3000, emoji: '🍲' });
    expect(np.status).toBe(201);
    expect((await call('GET', '/merchants/1')).body.products.some((p: any) => p.name_tj === 'Шӯрбо')).toBe(true);
    expect((await call('POST', '/merchant/products', m1.token, { name_tj: 'x', name_ru: 'x', price: 50 })).status).toBe(400); // < 1 с.
  });
});

describe('тақсими худкори курьер', () => {
  it('пешниҳод ба наздиктарин → рад → навбатӣ → қабул → ETA → расонидан', async () => {
    const customer = await login();
    const merchant = await userWithRole('merchant', 1);
    const cNear = await userWithRole('courier'); // ~0.1 км аз тарабхона
    const cMid = await userWithRole('courier'); // ~0.6 км
    const cFar = await userWithRole('courier'); // ~21 км — берун аз радиус
    await call('POST', '/courier/location', cNear.token, { lat: 38.574, lon: 68.787 });
    await call('POST', '/courier/location', cMid.token, { lat: 38.578, lon: 68.788 });
    await call('POST', '/courier/location', cFar.token, FAR);
    const wsNear = await openWs(cNear.token);
    const wsMid = await openWs(cMid.token);
    const wsCust = await openWs(customer.token);

    const o = (await placeOrder(customer.token)).body;
    expect(o.status).toBe('created');
    expect(o).toMatchObject({ entrance: '2', floor: '4', apartment: '17', comment: 'занг занед' });
    // То қабули тарабхона пешниҳод нест
    await dispatcher.tick();
    await wsNear.none('delivery.offer');

    expect((await call('POST', `/orders/${o.id}/status`, merchant.token, { status: 'accepted' })).status).toBe(200);
    const offer1 = await wsNear.next('delivery.offer');
    expect(offer1).toMatchObject({ orderId: o.id, merchantName: 'Ошхонаи Роҳат', deliveryFee: 700, cash: o.total, expiresInS: 30 });
    expect(offer1.pickupKm).toBeLessThan(0.2);
    await wsMid.none('delivery.offer'); // танҳо як курьер дар як вақт

    // Курьери дигар пешниҳоди бегонаро қабул карда наметавонад
    expect((await call('POST', `/courier/offers/${o.id}/accept`, cMid.token)).body.error).toBe('offer_expired');
    expect((await call('GET', '/courier/offer', cNear.token)).body.orderId).toBe(o.id);

    // Рад → навбатӣ
    expect((await call('POST', `/courier/offers/${o.id}/decline`, cNear.token)).status).toBe(200);
    const offer2 = await wsMid.next('delivery.offer');
    expect(offer2.orderId).toBe(o.id);
    expect((await call('POST', `/courier/offers/${o.id}/accept`, cMid.token)).status).toBe(200);
    expect(await wsCust.next('order.status')).toMatchObject({ status: 'accepted' });
    expect(await wsCust.next('order.status')).toMatchObject({ orderId: o.id, courierAssigned: true });

    const det = (await call('GET', `/orders/${o.id}`, customer.token)).body;
    expect(det.courier_id).toBe(cMid.id);
    expect(det.courier_phone).toMatch(/^\+992/);
    expect(new Date(det.eta_at).getTime()).toBeGreaterThan(Date.now() + 20 * 60000); // ҳанӯз ~25 дақ пухтан

    // Курьери банд пешниҳоди нав намегирад
    const o2 = (await placeOrder(customer.token)).body;
    await call('POST', `/orders/${o2.id}/status`, merchant.token, { status: 'accepted' });
    expect((await wsNear.next('delivery.offer')).orderId).toBe(o2.id);
    await wsMid.none('delivery.offer');

    // Ҳолатҳо: курьер то «ready» гирифта наметавонад
    expect((await call('POST', `/orders/${o.id}/status`, cMid.token, { status: 'picked_up' })).status).toBe(409);
    await call('POST', `/orders/${o.id}/status`, merchant.token, { status: 'ready' });
    expect((await call('POST', `/orders/${o.id}/status`, cMid.token, { status: 'picked_up' })).status).toBe(200);
    // Ҷойгиршавии курьер ба мизоҷ мерасад
    await call('POST', '/courier/location', cMid.token, { lat: 38.577, lon: 68.785 });
    expect(await wsCust.next('courier.location')).toMatchObject({ orderId: o.id, lat: 38.577 });
    expect((await call('POST', `/orders/${o.id}/status`, cMid.token, { status: 'delivered' })).status).toBe(200);
    const done = (await call('GET', `/orders/${o.id}`, customer.token)).body;
    expect(done.events.map((e: any) => e.status)).toEqual(['created', 'accepted', 'courier_assigned', 'ready', 'picked_up', 'delivered']);
    expect(done.courier_phone).toBeUndefined(); // баъди расонидан пинҳон

    // Офлайн → пешниҳод намегирад
    await call('POST', '/courier/offline', cMid.token);
    expect((await dispatcher.freeCouriersNear({ lat: 38.5733, lon: 68.7864 })).map((c) => c.id)).not.toContain(cMid.id);
    for (const w of [wsNear, wsMid, wsCust]) w.ws.close();
  });

  it('вақти пешниҳод гузашт → курьери навбатӣ (tick); бекор → пешниҳод тоза', async () => {
    const customer = await login();
    const merchant = await userWithRole('merchant', 1);
    const a = await userWithRole('courier');
    const b = await userWithRole('courier');
    await call('POST', '/courier/location', a.token, { lat: 38.5735, lon: 68.7866 });
    await call('POST', '/courier/location', b.token, { lat: 38.579, lon: 68.789 });
    const o = (await placeOrder(customer.token)).body;
    await call('POST', `/orders/${o.id}/status`, merchant.token, { status: 'accepted' });
    expect((await call('GET', '/courier/offer', a.token)).body.orderId).toBe(o.id);
    // TTL-ро тақлид мекунем (30 с гузашт)
    await redis.del(`offer:${o.id}`, `courier:offer:${a.id}`, 'dispatch:lock');
    await dispatcher.tick();
    expect((await call('GET', '/courier/offer', b.token)).body.orderId).toBe(o.id);
    expect((await call('GET', '/courier/offer', a.token)).body).toBeNull();
    await call('POST', `/orders/${o.id}/status`, merchant.token, { status: 'cancelled' });
    expect((await call('GET', '/courier/offer', b.token)).body).toBeNull();
  });
});

describe('пардохт бо корт', () => {
  const webhook = (ref: string, status: string, secret = SECRET) => {
    const raw = JSON.stringify({ ref, status });
    return app.inject({ method: 'POST', url: '/payments/webhook', payload: raw, headers: { 'content-type': 'application/json', 'x-signature': sign(secret, raw) } });
  };
  const refOf = async (orderId: number) => (await db.query('SELECT provider_ref FROM payments WHERE order_id = $1', [orderId])).rows[0].provider_ref as string;

  it('pending → имзои нодуруст 401 → paid → тарабхона мебинад; такрор бехатар; бекор → refund', async () => {
    const customer = await login();
    const merchant = await userWithRole('merchant', 1);
    const wsM = await openWs(merchant.token);

    const r = await placeOrder(customer.token, 'card');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'awaiting_payment', payment_status: 'pending' });
    expect(r.body.checkoutUrl).toMatch(/\/payments\/mock\/mock_/);
    // Тарабхона ҳоло намебинад ва қабул карда наметавонад
    await wsM.none('order.new');
    expect((await call('GET', `/orders/${r.body.id}`, merchant.token)).status).toBe(404);
    expect((await call('GET', '/orders', merchant.token)).body.some((o: any) => o.id === r.body.id)).toBe(false);
    expect((await call('POST', `/orders/${r.body.id}/status`, merchant.token, { status: 'accepted' })).status).toBe(404);

    const ref = await refOf(r.body.id);
    expect((await webhook(ref, 'paid', 'wrong-secret')).statusCode).toBe(401);
    expect((await webhook(ref, 'paid')).statusCode).toBe(200);
    expect((await wsM.next('order.new')).orderId).toBe(r.body.id);
    expect((await call('GET', `/orders/${r.body.id}`, customer.token)).body).toMatchObject({ status: 'created', payment_status: 'paid' });
    // Такрори webhook — бетаъсир
    expect(JSON.parse((await webhook(ref, 'failed')).body)).toMatchObject({ duplicate: true });
    expect((await call('GET', `/orders/${r.body.id}`, customer.token)).body.status).toBe('created');

    // Тарабхона бекор мекунад → пул бармегардад
    await call('POST', `/orders/${r.body.id}/status`, merchant.token, { status: 'cancelled' });
    expect(payments.refunds.at(-1)).toEqual({ ref, amount: r.body.total });
    expect((await call('GET', `/orders/${r.body.id}`, customer.token)).body.payment_status).toBe('refunded');
    wsM.ws.close();
  });

  it('рад аз бонк → фармоиш бекор; саҳифаи санҷишӣ кор мекунад', async () => {
    const customer = await login();
    const r = await placeOrder(customer.token, 'card');
    const ref = await refOf(r.body.id);
    const page = await app.inject({ method: 'GET', url: `/payments/mock/${ref}` });
    expect(page.body).toContain('Пардохт кардан');
    const done = await app.inject({ method: 'POST', url: `/payments/mock/${ref}/complete`, payload: 'status=failed', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(done.statusCode).toBe(303);
    expect((await call('GET', `/orders/${r.body.id}`, customer.token)).body).toMatchObject({ status: 'cancelled', payment_status: 'failed' });
  });

  it('мизоҷ пеш аз webhook бекор кард, баъд пул омад → refund', async () => {
    const customer = await login();
    const r = await placeOrder(customer.token, 'card');
    expect((await call('POST', `/orders/${r.body.id}/status`, customer.token, { status: 'cancelled' })).status).toBe(200);
    const ref = await refOf(r.body.id);
    expect((await webhook(ref, 'paid')).statusCode).toBe(200);
    expect(payments.refunds.at(-1)?.ref).toBe(ref);
    expect((await call('GET', `/orders/${r.body.id}`, customer.token)).body).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
  });
});

describe('production: рақамҳои тестӣ', () => {
  it('бе SMS-и воқеӣ танҳо рақамҳои рӯйхат; рамз танҳо ба онҳо', async () => {
    const prod = await buildApp({ ...app.deps, cfg: { ...app.deps.cfg, isProd: true, otpTestPhones: ['+992955555555'] } });
    const req = (phone: string) => prod.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
    const ok = await req('+992955555555');
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).devCode).toMatch(/^\d{6}$/);
    const other = await req('+992955555556');
    expect(other.statusCode).toBe(503);
    expect(JSON.parse(other.body).error).toBe('sms_unavailable');
    await prod.close();
  });
});

describe('ҳисоботи хатоҳо', () => {
  it('қабул мекунад, нодурустро рад мекунад, басомадро маҳдуд мекунад', async () => {
    const send = (payload: unknown) => app.inject({ method: 'POST', url: '/client-errors', payload: payload as object, remoteAddress: '10.9.9.9' });
    const ok = await send({ source: 'android-native', message: 'java.lang.IllegalStateException: x', stack: 'at a.b(C.kt:1)', device: 'Xiaomi X', android: '14 (SDK 34)', app: '1.0.0' });
    expect(ok.statusCode).toBe(204);
    expect((await send({ message: 'no source' })).statusCode).toBe(400);
    const big = await app.inject({ method: 'POST', url: '/client-errors', payload: { source: 'x', message: 'y'.repeat(70000) }, remoteAddress: '10.9.9.8' });
    expect(big.statusCode).toBe(413);
    let last = 0;
    for (let i = 0; i < 30; i++) last = (await send({ source: 'js', message: 'flood' })).statusCode;
    expect(last).toBe(429);
  });
});

describe('CORS', () => {
  it('preflight барои PATCH ва DELETE (панели веб)', async () => {
    for (const m of ['PATCH', 'DELETE']) {
      const r = await app.inject({ method: 'OPTIONS', url: '/merchant/products/1', headers: { origin: 'http://localhost:8081', 'access-control-request-method': m } });
      expect(r.statusCode).toBe(204);
      expect(String(r.headers['access-control-allow-methods'])).toContain(m);
    }
  });
});

describe('ҳуқуқҳо', () => {
  it('бегона намебинад; мизоҷ «accepted» карда наметавонад', async () => {
    const a = await login();
    const b = await login();
    const o = (await placeOrder(a.token)).body;
    expect((await call('GET', `/orders/${o.id}`, b.token)).status).toBe(404);
    expect((await call('POST', `/orders/${o.id}/status`, b.token, { status: 'cancelled' })).status).toBe(404);
    expect((await call('POST', `/orders/${o.id}/status`, a.token, { status: 'accepted' })).status).toBe(409);
    expect((await call('POST', `/orders/${o.id}/status`, a.token, { status: 'cancelled' })).status).toBe(200);
  });
});
