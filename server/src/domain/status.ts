/**
 * Мошини ҳолатҳо (state machine) барои фармоиши доставка.
 * Калид: ҳолати ҷорӣ → { ҳолати нав: нақшҳое, ки иҷозат доранд }.
 *
 *   awaiting_payment ─(пардохт)→ created → accepted → ready → picked_up → delivered
 *          └──────────────┴──────────┴─────────┴→ cancelled
 *
 * awaiting_payment → created/cancelled танҳо аз ҷониби система (webhook-и пардохт).
 * Курьер ба фармоиш алоҳида (courier_id) таъин мешавад — ҳолатро иваз намекунад.
 */
export type OrderKind = 'food' | 'market';
export type Role = 'customer' | 'courier' | 'merchant' | 'admin';
export type Actor = Role | 'system';

const FLOW: Record<string, Record<string, Actor[]>> = {
  awaiting_payment: { created: ['system'], cancelled: ['system', 'customer'] },
  created:          { accepted: ['merchant'], cancelled: ['customer', 'merchant'] },
  accepted:         { ready: ['merchant'], cancelled: ['merchant'] },
  ready:            { picked_up: ['courier'] },
  picked_up:        { delivered: ['courier'] },
  delivered:        {},
  cancelled:        {},
};

export const STATUSES = Object.keys(FLOW);
export const FINAL = ['delivered', 'cancelled'];
/** Ҳолатҳое, ки курьер метавонад ба фармоиш таъин шавад */
export const DISPATCHABLE = ['accepted', 'ready'];

export function initialStatus(payment: 'cash' | 'card') {
  return payment === 'card' ? 'awaiting_payment' : 'created';
}

export function canTransition(from: string, to: string, actor: Actor): boolean {
  const allowed = FLOW[from]?.[to];
  if (!allowed) return false;
  return actor === 'admin' || allowed.includes(actor);
}

export const isFinal = (s: string) => FINAL.includes(s);
