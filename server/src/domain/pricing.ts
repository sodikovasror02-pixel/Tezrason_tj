/**
 * Ҳисоби нархҳо. Ҳама пул — дар ДИРАМ (integer), то хатои float набошад.
 * 1 TJS = 100 дирам.
 */
export type GeoPoint = { lat: number; lon: number };

export const R_EARTH_KM = 6371;
/** d_роҳ ≈ k·d₀ — то пайваст кардани OSRM */
export const ROUTE_FACTOR = 1.3;
/** Суръати миёнаи шаҳрӣ, км/соат */
export const AVG_SPEED_KMH = 25;
/** Хизматрасонӣ: 5 % */
export const SERVICE_RATE = 0.05;

/** a = sin²(Δφ/2) + cosφ₁·cosφ₂·sin²(Δλ/2);  d = 2R·atan2(√a, √(1−a)) */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dPhi = rad(b.lat - a.lat);
  const dLam = rad(b.lon - a.lon);
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLam / 2) ** 2;
  return 2 * R_EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type Tariff = { id: string; base: number; per_km: number; per_min: number; min_fare: number };

export type FareQuote = {
  tariffId: string;
  straightKm: number;
  routeKm: number;
  minutes: number;
  base: number;
  distCost: number;
  timeCost: number;
  surge: number;
  total: number; // дирам
};

/** Соатҳои серодам (вақти Душанбе, UTC+5): 07–09, 17–19 → ×1.3 */
export function surgeAt(date: Date): number {
  const h = (date.getUTCHours() + 5) % 24;
  return (h >= 7 && h < 9) || (h >= 17 && h < 19) ? 1.3 : 1.0;
}

/**
 * C = max(C_min, round₁₀₀((C₀ + c_km·d + c_min·t)·k_surge))
 * d, t — аз масир (OSRM ё тахмин). Яклухткунӣ то 1 сомонӣ — барои пардохти нақд.
 */
export function taxiFare(
  route: { straightKm: number; distanceKm: number; durationMin: number },
  t: Tariff,
  surge: number,
): FareQuote {
  const distCost = Math.round(t.per_km * route.distanceKm);
  const timeCost = Math.round(t.per_min * route.durationMin);
  const raw = (t.base + distCost + timeCost) * surge;
  const total = Math.max(t.min_fare, Math.round(raw / 100) * 100);
  return {
    tariffId: t.id,
    straightKm: route.straightKm,
    routeKm: route.distanceKm,
    minutes: route.durationMin,
    base: t.base,
    distCost,
    timeCost,
    surge,
    total,
  };
}

/** Расонидан: C = max(700, 500 + 150·d) дирам, яклухт то 1 сомонӣ */
export function deliveryFee(from: GeoPoint, to: GeoPoint): number {
  const d = haversineKm(from, to) * ROUTE_FACTOR;
  return Math.max(700, Math.round((500 + 150 * d) / 100) * 100);
}

export type CartTotals = { subtotal: number; deliveryFee: number; serviceFee: number; total: number };

export function cartTotals(lines: { price: number; qty: number }[], fee: number): CartTotals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const serviceFee = Math.round(subtotal * SERVICE_RATE);
  return { subtotal, deliveryFee: fee, serviceFee, total: subtotal + fee + serviceFee };
}
