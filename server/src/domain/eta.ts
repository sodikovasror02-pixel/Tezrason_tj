/**
 * Вақти тахминии расидан (ETA), дақ:
 *
 *   T = max(t_омода, t_курьер→тарабхона) + t_супоридан + t_тарабхона→мизоҷ
 *
 * t_омода       — вақти боқимондаи пухтан (prep_min − гузашта), ≥ 0
 * t_курьер→т.   — агар курьер ҳанӯз таъин нашуда бошад, COURIER_SEARCH_MIN
 * t_супоридан   — гирифтан аз тарабхона, HANDOVER_MIN
 */
export const HANDOVER_MIN = 3;
export const COURIER_SEARCH_MIN = 10;

export function etaMinutes(p: { prepLeftMin: number; courierToMerchantMin: number | null; merchantToCustomerMin: number }): number {
  const wait = Math.max(Math.max(0, p.prepLeftMin), p.courierToMerchantMin ?? COURIER_SEARCH_MIN);
  return Math.ceil(wait + HANDOVER_MIN + p.merchantToCustomerMin);
}
