/** Нархҳоро сервер ҳисоб мекунад (server/src/domain/pricing.ts). Ин ҷо танҳо формат. */
export const fmt = (dirams: number) => {
  const s = dirams / 100;
  return `${Number.isInteger(s) ? s.toFixed(0) : s.toFixed(2)} c.`;
};
