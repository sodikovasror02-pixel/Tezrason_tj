/**
 * Ҳисоби нархҳо. Ҳама пул — дар ДИРАМ (integer), то хатои float набошад.
 * 1 TJS = 100 дирам.
 */
export type GeoPoint = { lat: number; lon: number };

export const R_EARTH_KM = 6371;
/** d_роҳ ≈ k·d₀ — вақте OSRM нест */
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

/** Расонидан: C = max(700, round₁₀₀(500 + 150·d)) дирам, d — масофаи роҳ, км */
export function deliveryFeeByKm(routeKm: number): number {
  return Math.max(700, Math.round((500 + 150 * routeKm) / 100) * 100);
}

export type CartTotals = { subtotal: number; deliveryFee: number; serviceFee: number; total: number };

export function cartTotals(lines: { price: number; qty: number }[], fee: number): CartTotals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const serviceFee = Math.round(subtotal * SERVICE_RATE);
  return { subtotal, deliveryFee: fee, serviceFee, total: subtotal + fee + serviceFee };
}
