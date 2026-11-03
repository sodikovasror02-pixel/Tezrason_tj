import type pg from 'pg';
import type { Deps, Me } from './app.js';
import { HttpError, tx } from './infra.js';
import { Actor, canTransition, OrderKind } from './domain/status.js';

export type OrderRow = {
  id: number;
  kind: OrderKind;
  status: string;
  user_id: number;
  merchant_id: number;
  courier_id: number | null;
  payment: 'cash' | 'card';
  payment_status: string;
  total: number;
};

type Q = pg.PoolClient | pg.Pool;

export async function loadOrder(c: Q, id: number, lock = false): Promise<OrderRow> {
  const { rows } = await c.query(
    `SELECT id, kind, status, user_id, merchant_id, courier_id, payment, payment_status, total
     FROM orders WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'order_not_found');
  return rows[0];
}

export function canSee(me: Me, o: OrderRow): boolean {
  if (me.role === 'admin') return true;
  if (o.user_id === me.id) return true;
  // Тарабхона фармоиши то ҳол пардохтнашударо намебинад
  if (me.role === 'merchant' && o.merchant_id === me.merchant_id) return o.status !== 'awaiting_payment';
  if (me.role === 'courier' && o.courier_id === me.id) return true;
  return false;
}

export async function logEvent(c: pg.PoolClient, orderId: number, status: string, actorId: number | null) {
  await c.query('INSERT INTO order_events (order_id, status, actor_id) VALUES ($1, $2, $3)', [orderId, status, actorId]);
}

/** Огоҳ кардани ҳамаи тарафҳо дар бораи тағйирот */
export async function notify(deps: Deps, o: Pick<OrderRow, 'id' | 'user_id' | 'merchant_id' | 'courier_id'>, status: string, extra: Record<string, unknown> = {}) {
  const payload = { orderId: o.id, status, ...extra };
  const jobs = [deps.rt.publish(`user:${o.user_id}`, 'order.status', payload)];
  if (status !== 'awaiting_payment') jobs.push(deps.rt.publish(`merchant:${o.merchant_id}`, 'order.status', payload));
  if (o.courier_id) jobs.push(deps.rt.publish(`user:${o.courier_id}`, 'order.status', payload));
  await Promise.all(jobs);
}

/**
 * Ягона роҳи тағйири ҳолат: санҷиши мошини ҳолатҳо, журнал, огоҳӣ,
 * баргардонидани пул ҳангоми бекор кардани фармоиши пардохтшуда.
 */
export async function transition(deps: Deps, id: number, to: string, actor: Actor, actorId: number | null, guard?: (o: OrderRow) => void): Promise<OrderRow> {
  const o = await tx(deps.db, async (c) => {
    const o = await loadOrder(c, id, true); // FOR UPDATE — ҳимоя аз race condition
    guard?.(o);
    if (!canTransition(o.status, to, actor)) throw new HttpError(409, 'invalid_transition', `${o.status} → ${to} (${actor})`);
    await c.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
    await logEvent(c, id, to, actorId);
    return o;
  });

  if (to === 'cancelled' && o.payment_status === 'paid') await refundOrder(deps, id);
  await notify(deps, o, to);
  if (to === 'created') await deps.rt.publish(`merchant:${o.merchant_id}`, 'order.new', { orderId: id });
  await deps.dispatcher.onStatus(id, to);
  return { ...o, status: to };
}

async function refundOrder(deps: Deps, orderId: number) {
  const { rows } = await deps.db.query(`SELECT provider_ref, amount FROM payments WHERE order_id = $1 AND status = 'paid'`, [orderId]);
  for (const p of rows) {
    await deps.payments.refund(p.provider_ref, p.amount);
    await deps.db.query(`UPDATE payments SET status = 'refunded', updated_at = now() WHERE provider_ref = $1`, [p.provider_ref]);
  }
  if (rows.length) await deps.db.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId]);
}
