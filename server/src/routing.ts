import { createHash } from 'node:crypto';
import { AVG_SPEED_KMH, GeoPoint, haversineKm, ROUTE_FACTOR } from './domain/pricing.js';
import type { RedisClient } from './infra.js';

export type Route = {
  distanceKm: number;
  /** Вақти сафар бо назардошти трафик, дақ */
  durationMin: number;
  /** Хатти масир: [[lat, lon], …] */
  geometry: [number, number][];
  source: 'osrm' | 'estimate';
};

export interface Router {
  route(from: GeoPoint, to: GeoPoint): Promise<Route>;
}

/**
 * Ҳисоби тахминӣ: d = k·d₀ (k = 1.3), t = d / v (v = 25 км/с), хатти рост.
 * Ҳамчун fallback, вақте OSRM дастрас нест.
 */
export class EstimateRouter implements Router {
  async route(from: GeoPoint, to: GeoPoint): Promise<Route> {
    const distanceKm = haversineKm(from, to) * ROUTE_FACTOR;
    return {
      distanceKm,
      durationMin: (distanceKm / AVG_SPEED_KMH) * 60,
      geometry: [[from.lat, from.lon], [to.lat, to.lon]],
      source: 'estimate',
    };
  }
}

/**
 * OSRM (Open Source Routing Machine), профили `car`.
 * Барои production — сервери худ бо харитаи OSM-и Тоҷикистон
 * (download.geofabrik.de/asia/tajikistan) — сервери намоишии
 * router.project-osrm.org барои истифодаи тиҷоратӣ иҷозат дода намешавад.
 *
 * Вақти OSRM — бе трафик (free-flow); бо коэффитсиенти трафик зарб мекунем:
 *   t = t_osrm · k_traffic
 */
export class OsrmRouter implements Router {
  constructor(
    private baseUrl: string,
    private opts: { trafficFactor: number; timeoutMs: number; fallback: Router },
  ) {}

  async route(from: GeoPoint, to: GeoPoint): Promise<Route> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(this.opts.timeoutMs) });
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const body = (await res.json()) as {
        code: string;
        routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
      };
      const r = body.routes?.[0];
      if (body.code !== 'Ok' || !r) throw new Error(`OSRM ${body.code}`);
      return {
        distanceKm: r.distance / 1000, // м → км
        durationMin: (r.duration / 60) * this.opts.trafficFactor, // с → дақ
        geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        source: 'osrm',
      };
    } catch {
      return this.opts.fallback.route(from, to);
    }
  }
}

/** Кэши масирҳо дар Redis (1 соат). Координатаҳо то 4 рақам (~11 м) яклухт мешаванд. */
export class CachedRouter implements Router {
  constructor(private inner: Router, private redis: RedisClient, private ttlS = 3600) {}

  async route(from: GeoPoint, to: GeoPoint): Promise<Route> {
    const k = [from.lat, from.lon, to.lat, to.lon].map((x) => x.toFixed(4)).join(',');
    const key = `route:${createHash('sha1').update(k).digest('hex')}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as Route;
    const r = await this.inner.route(from, to);
    // Ҳисоби тахминиро кам нигоҳ медорем — шояд OSRM зуд барқарор шавад
    await this.redis.set(key, JSON.stringify(r), 'EX', r.source === 'osrm' ? this.ttlS : 60);
    return r;
  }
}
