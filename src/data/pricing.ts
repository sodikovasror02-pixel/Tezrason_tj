import { GeoPoint, Tariff } from './mock';

const R_EARTH_KM = 6371; // радиуси миёнаи Замин, км

/**
 * Масофаи доираи калон (haversine):
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   d = 2R · atan2(√a, √(1−a))
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dPhi = rad(b.lat - a.lat);
  const dLam = rad(b.lon - a.lon);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLam / 2) ** 2;
  return 2 * R_EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Коэффитсиенти печутоби роҳ (road detour factor): d_роҳ ≈ k · d_мустақим */
export const ROUTE_FACTOR = 1.3;
/** Суръати миёнаи шаҳрӣ, км/соат */
export const AVG_SPEED_KMH = 25;

export type FareBreakdown = {
  straightKm: number;
  routeKm: number;
  minutes: number;
  base: number;
  distCost: number;
  timeCost: number;
  surge: number;
  total: number;
};

/**
 * Нархи такси:
 *   C = max(C_min, (C₀ + c_km·d + c_min·t) · k_surge)
 *   t = d / v · 60
 */
export function taxiFare(from: GeoPoint, to: GeoPoint, t: Tariff, surge = 1): FareBreakdown {
  const straightKm = haversineKm(from, to);
  const routeKm = straightKm * ROUTE_FACTOR;
  const minutes = (routeKm / AVG_SPEED_KMH) * 60;
  const distCost = t.perKm * routeKm;
  const timeCost = t.perMin * minutes;
  const raw = (t.base + distCost + timeCost) * surge;
  return {
    straightKm,
    routeKm,
    minutes,
    base: t.base,
    distCost,
    timeCost,
    surge,
    total: Math.max(t.minFare, Math.round(raw)),
  };
}

/** Нархи расонидан: C = 5 + 1.5·d (TJS), ҳадди ақал 7 */
export function deliveryFee(from: GeoPoint, to: GeoPoint): number {
  const d = haversineKm(from, to) * ROUTE_FACTOR;
  return Math.max(7, Math.round(5 + 1.5 * d));
}

/** Хизматрасонӣ 5% аз ҳамагӣ */
export const SERVICE_RATE = 0.05;

export const fmt = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 2)} c.`;
