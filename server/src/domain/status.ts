/**
 * Мошини ҳолатҳо (state machine) барои фармоишҳо.
 * Калид: ҳолати ҷорӣ → { ҳолати нав: нақшҳое, ки иҷозат доранд }.
 */
export type OrderKind = 'food' | 'market' | 'taxi';
export type Role = 'customer' | 'driver' | 'courier' | 'merchant' | 'admin';

type Graph = Record<string, Record<string, Role[]>>;

const delivery: Graph = {
  created:   { accepted: ['merchant'], cancelled: ['customer', 'merchant'] },
  accepted:  { ready: ['merchant'], cancelled: ['merchant'] },
  ready:     { picked_up: ['courier'] },
  picked_up: { delivered: ['courier'] },
  delivered: {},
  cancelled: {},
};

const taxi: Graph = {
  searching:       { driver_assigned: ['driver'], cancelled: ['customer'] },
  driver_assigned: { arrived: ['driver'], cancelled: ['customer', 'driver'] },
  arrived:         { in_progress: ['driver'], cancelled: ['customer', 'driver'] },
  in_progress:     { completed: ['driver'] },
  completed:       {},
  cancelled:       {},
};

export const FLOWS: Record<OrderKind, Graph> = { food: delivery, market: delivery, taxi };
export const INITIAL: Record<OrderKind, string> = { food: 'created', market: 'created', taxi: 'searching' };

export function canTransition(kind: OrderKind, from: string, to: string, role: Role): boolean {
  if (role === 'admin') return to in (FLOWS[kind][from] ?? {});
  return FLOWS[kind][from]?.[to]?.includes(role) ?? false;
}

export const isFinal = (kind: OrderKind, s: string) => Object.keys(FLOWS[kind][s] ?? {}).length === 0;
