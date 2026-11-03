import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CachedRouter, EstimateRouter, OsrmRouter, Route, Router } from '../src/routing.js';
import { createRedis, RedisClient } from '../src/infra.js';

const A = { lat: 38.5762, lon: 68.7797 };
const B = { lat: 38.5433, lon: 68.825 };

// Сервери сохтаи OSRM: ҷавоби ҳақиқии шакли /route/v1
let mode: 'ok' | 'error' | 'slow' | 'noroute' = 'ok';
let hits = 0;
const fake = http.createServer((req, res) => {
  hits++;
  if (mode === 'error') return res.writeHead(500).end();
  if (mode === 'slow') return setTimeout(() => res.end('{}'), 500);
  res.setHeader('content-type', 'application/json');
  if (mode === 'noroute') return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
  res.end(JSON.stringify({
    code: 'Ok',
    routes: [{ distance: 7420, duration: 600, geometry: { type: 'LineString', coordinates: [[68.7797, 38.5762], [68.80, 38.56], [68.825, 38.5433]] } }],
  }));
});
let url: string;
let redis: RedisClient;

beforeAll(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  redis = createRedis('redis://localhost:6379/14');
  await redis.flushdb();
});
afterAll(() => {
  fake.close();
  redis.disconnect();
});

const osrm = () => new OsrmRouter(url, { trafficFactor: 1.3, timeoutMs: 200, fallback: new EstimateRouter() });

describe('OsrmRouter', () => {
  it('м → км, с → дақ × k_traffic, [lon,lat] → [lat,lon]', async () => {
    mode = 'ok';
    const r = await osrm().route(A, B);
    expect(r.source).toBe('osrm');
    expect(r.distanceKm).toBeCloseTo(7.42, 5); // 7420 м
    expect(r.durationMin).toBeCloseTo(13, 5); // 600 с = 10 дақ · 1.3
    expect(r.geometry[0]).toEqual([38.5762, 68.7797]);
    expect(r.geometry).toHaveLength(3);
  });
  it.each(['error', 'slow', 'noroute'] as const)('fallback ба тахмин ҳангоми %s', async (m) => {
    mode = m;
    const r = await osrm().route(A, B);
    expect(r.source).toBe('estimate');
    expect(r.distanceKm).toBeCloseTo(6.99, 2); // 5.376 · 1.3
  });
});

describe('CachedRouter', () => {
  it('такрорӣ аз Redis гирифта мешавад', async () => {
    let calls = 0;
    const inner: Router = { route: async (): Promise<Route> => (calls++, { distanceKm: 1, durationMin: 2, geometry: [], source: 'osrm' }) };
    const c = new CachedRouter(inner, redis);
    await c.route(A, B);
    await c.route({ lat: A.lat + 0.00001, lon: A.lon }, B); // ~1 м фарқ → ҳамон калид
    expect(calls).toBe(1);
    await c.route(B, A);
    expect(calls).toBe(2);
  });
});
