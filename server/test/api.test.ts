import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp, App } from '../src/app.js';
import { createDb, createRedis, Db, loadConfig, migrate, RedisClient } from '../src/infra.js';
import { Realtime } from '../src/realtime.js';
import { ConsoleSms } from '../src/sms.js';
import { haversineKm, taxiFare } from '../src/domain/pricing.js';
import { EstimateRouter } from '../src/routing.js';

const ADMIN = '+992900000001';
const OZODI = { lat: 38.5762, lon: 68.7797 };
const AIRPORT = { lat: 38.5433, lon: 68.825 };

let app: App, db: Db, redis: RedisClient, sub: RedisClient, base: string;
const sms = new ConsoleSms();

beforeAll(async () => {
  const cfg = { ...loadConfig({ ADMIN_PHONES: ADMIN }), databaseUrl: 'postgres://hizmat:hizmat@localhost:5432/hizmat_test', redisUrl: 'redis://localhost:6379/15' };
  db = createDb(cfg.databaseUrl);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  redis = createRedis(cfg.redisUrl);
  await redis.flushdb();
  sub = createRedis(cfg.redisUrl);
  const rt = new Realtime(redis, sub);
  await rt.start();
  app = await buildApp({ cfg, db, redis, rt, sms, router: new EstimateRouter() });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as { port: number };
  base = `127.0.0.1:${addr.port}`;
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
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
}
async function login(phone: string) {
  const r1 = await call('POST', '/auth/otp/request', undefined, { phone });
  expect(r1.status).toBe(200);
  const r2 = await call('POST', '/auth/otp/verify', undefined, { phone, code: r1.body.devCode });
  expect(r2.status).toBe(200);
  return { token: r2.body.token as string, id: Number(r2.body.user.id) };
}
let adminToken: string;
async function userWithRole(phone: string, role: string, merchantId?: number) {
  adminToken ??= (await login(ADMIN)).token;
  const u = await login(phone);
  const r = await call('PATCH', `/admin/users/${u.id}`, adminToken, { role, merchantId });
  expect(r.status).toBe(200);
  return u;
}
function openWs(token: string): Promise<{ ws: WebSocket; next: (event: string) => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws?token=${token}`);
    const queue: any[] = [];
    const waiters: { event: string; fn: (d: any) => void }[] = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      const i = waiters.findIndex((w) => w.event === m.event);
      if (i >= 0) waiters.splice(i, 1)[0].fn(m.data);
      else queue.push(m);
      if (m.event === 'hello') resolve({ ws, next });
    });
    ws.on('error', reject);
    function next(event: string) {
      const i = queue.findIndex((m) => m.event === event);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0].data);
      return new Promise((res, rej) => {
        waiters.push({ event, fn: res });
        setTimeout(() => rej(new Error(`timeout waiting ${event}`)), 3000);
      });
    }
  });
}

// ── тестҳо ──
describe('pricing', () => {
  it('haversine: Майдони Озодӣ → Фурудгоҳ ≈ 5.38 км', () => {
    expect(haversineKm(OZODI, AIRPORT)).toBeCloseTo(5.38, 2);
  });
  it('такси Эконом = 24 сомонӣ (2400 дирам)', async () => {
    const route = await new EstimateRouter().route(OZODI, AIRPORT);
    const q = taxiFare({ ...route, straightKm: haversineKm(OZODI, AIRPORT) }, { id: 'econom', base: 500, per_km: 200, per_min: 30, min_fare: 1000 }, 1);
    // 500 + 200·6.99 + 30·16.78 = 500 + 1398 + 503 = 2401 → 2400
    expect(q.distCost).toBe(1398);
    expect(q.timeCost).toBe(503);
    expect(q.total).toBe(2400);
  });
  it('ҳадди ақал (min_fare) барои сафари кӯтоҳ', () => {
    const q = taxiFare({ straightKm: 0.1, distanceKm: 0.15, durationMin: 0.4 }, { id: 'x', base: 500, per_km: 200, per_min: 30, min_fare: 1000 }, 1);
    expect(q.total).toBe(1000);
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
  it('бе токен → 401', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me', 'garbage')).status).toBe(401);
  });
});

describe('хӯрок: фармоиш → тарабхона → курьер', () => {
  it('ҷараёни пурра бо нархи серверӣ ва ҳуқуқҳо', async () => {
    const customer = await login('+992920000001');
    const stranger = await login('+992920000002');
    const merchant = await userWithRole('+992920000003', 'merchant', 1);
    const courier = await userWithRole('+992920000004', 'courier');
    const custWs = await openWs(customer.token);
    const merchWs = await openWs(merchant.token);

    const menu = (await call('GET', '/merchants/1')).body;
    const plov = menu.products.find((p: any) => p.name_tj === 'Оши палов');
    const samsa = menu.products.find((p: any) => p.name_tj === 'Самбӯса');

    // Клиент нархро намефиристад; қаторҳои такрорӣ якҷоя мешаванд
    const r = await call('POST', '/orders', customer.token, {
      merchantId: 1,
      items: [{ productId: plov.id, qty: 1 }, { productId: samsa.id, qty: 1 }, { productId: samsa.id, qty: 1 }],
      address: 'хиёб. Рӯдакӣ 45', to: { lat: 38.5781, lon: 68.7838 }, payment: 'cash',
    });
    expect(r.status).toBe(201);
    const o = r.body;
    // 3500 + 2·800 = 5100; хизмат 5% = 255; расонидан = max(700, round((500+150·0.69)/100)·100) = 700
    expect(o.subtotal).toBe(5100);
    expect(o.service_fee).toBe(255);
    expect(o.delivery_fee).toBe(700);
    expect(o.total).toBe(6055);
    expect((await merchWs.next('order.new')).orderId).toBe(Number(o.id));

    // Маҳсулоти тарабхонаи дигар → 400
    const pizza = (await call('GET', '/merchants/3')).body.products[0];
    expect((await call('POST', '/orders', customer.token, { merchantId: 1, items: [{ productId: pizza.id, qty: 1 }], address: 'xxx', to: OZODI, payment: 'cash' })).status).toBe(400);

    // Бегона фармоишро намебинад
    expect((await call('GET', `/orders/${o.id}`, stranger.token)).status).toBe(404);
    // Мизоҷ худаш "accepted" карда наметавонад
    expect((await call('POST', `/orders/${o.id}/status`, customer.token, { status: 'accepted' })).status).toBe(409);

    expect((await call('POST', `/orders/${o.id}/status`, merchant.token, { status: 'accepted' })).status).toBe(200);
    expect(await custWs.next('order.status')).toMatchObject({ orderId: Number(o.id), status: 'accepted' });

    // Курьер то гирифтан ҳолатро иваз карда наметавонад
    expect((await call('POST', `/orders/${o.id}/status`, courier.token, { status: 'picked_up' })).status).toBe(404);
    const jobs = (await call('GET', '/jobs', courier.token)).body;
    expect(jobs.some((j: any) => Number(j.id) === Number(o.id))).toBe(true);
    expect((await call('POST', `/orders/${o.id}/claim`, courier.token)).status).toBe(200);

    expect((await call('POST', `/orders/${o.id}/status`, courier.token, { status: 'picked_up' })).status).toBe(409); // ҳанӯз ready нест
    expect((await call('POST', `/orders/${o.id}/status`, merchant.token, { status: 'ready' })).status).toBe(200);
    expect((await call('POST', `/orders/${o.id}/status`, courier.token, { status: 'picked_up' })).status).toBe(200);
    expect((await call('POST', `/orders/${o.id}/status`, courier.token, { status: 'delivered' })).status).toBe(200);

    const full = (await call('GET', `/orders/${o.id}`, customer.token)).body;
    expect(full.status).toBe('delivered');
    expect(full.items).toHaveLength(2);
    expect(full.events.map((e: any) => e.status)).toEqual(['created', 'accepted', 'ready', 'picked_up', 'delivered']);
    const list = (await call('GET', '/orders', customer.token)).body;
    expect(list[0]).toMatchObject({ id: o.id, merchant_name: 'Ошхонаи Роҳат', status: 'delivered' });
    custWs.ws.close();
    merchWs.ws.close();
  });
});

describe('такси: диспетчеризатсия ва race condition', () => {
  it('ронандаи наздик пешниҳод мегирад, танҳо як нафар фармоишро мегирад', async () => {
    const customer = await login('+992930000001');
    const near = await userWithRole('+992930000002', 'driver');
    const near2 = await userWithRole('+992930000003', 'driver');
    const far = await userWithRole('+992930000004', 'driver');

    await call('POST', '/drivers/location', near.token, { lat: 38.5770, lon: 68.7800 }); // ~0.1 км
    await call('POST', '/drivers/location', near2.token, { lat: 38.5800, lon: 68.7850 }); // ~0.6 км
    await call('POST', '/drivers/location', far.token, { lat: 38.40, lon: 68.60 }); // ~25 км
    expect((await call('POST', '/drivers/location', customer.token, OZODI)).status).toBe(403);

    const nearWs = await openWs(near.token);
    const custWs = await openWs(customer.token);

    const qr = (await call('POST', '/quotes/taxi', undefined, { from: OZODI, to: AIRPORT })).body;
    expect(qr.quotes.map((q: any) => q.tariffId)).toEqual(['econom', 'comfort', 'business']);
    expect(qr.route.source).toBe('estimate');
    expect(qr.route.geometry).toHaveLength(2);

    const r = await call('POST', '/rides', customer.token, { from: OZODI, to: AIRPORT, fromName: 'Озодӣ', toName: 'Фурудгоҳ', tariffId: 'econom', payment: 'cash' });
    expect(r.status).toBe(201);
    expect(r.body.offeredTo).toBe(2); // дури 25 км пешниҳод намегирад
    const offer = await nearWs.next('ride.offer');
    expect(offer.orderId).toBe(Number(r.body.id));
    expect(offer.pickupKm).toBeLessThan(0.2);

    // Ду ронанда ҳамзамон → як 200, як 409
    const [a, b] = await Promise.all([
      call('POST', `/orders/${r.body.id}/claim`, near.token),
      call('POST', `/orders/${r.body.id}/claim`, near2.token),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? near : near2;
    expect(await custWs.next('order.status')).toMatchObject({ status: 'driver_assigned' });

    // Ҷойгиршавии ронанда ба мизоҷ мерасад
    await call('POST', '/drivers/location', winner.token, { lat: 38.5765, lon: 68.7798 });
    expect(await custWs.next('driver.location')).toMatchObject({ lat: 38.5765 });
    const det = (await call('GET', `/orders/${r.body.id}`, customer.token)).body;
    expect(det.driverLocation.lat).toBeCloseTo(38.5765, 4);
    expect(Number(det.ride.route_km)).toBeCloseTo(6.99, 1);
    expect(det.ride.geometry[0]).toEqual([OZODI.lat, OZODI.lon]);

    // Ронандаи банд пешниҳод намегирад
    const r2 = await call('POST', '/rides', customer.token, { from: OZODI, to: AIRPORT, tariffId: 'econom', payment: 'cash' });
    expect(r2.body.offeredTo).toBe(1);

    for (const s of ['arrived', 'in_progress', 'completed'])
      expect((await call('POST', `/orders/${r.body.id}/status`, winner.token, { status: s })).status).toBe(200);
    expect((await call('POST', `/orders/${r.body.id}/status`, customer.token, { status: 'cancelled' })).status).toBe(409);

    // Мизоҷ ҷустуҷӯро бекор мекунад
    expect((await call('POST', `/orders/${r2.body.id}/status`, customer.token, { status: 'cancelled' })).status).toBe(200);
    nearWs.ws.close();
    custWs.ws.close();
  });
});
