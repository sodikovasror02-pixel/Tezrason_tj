import { z } from 'zod';
import type { App } from '../app.js';
import { HttpError } from '../infra.js';
import { sign } from '../payments.js';
import { transition } from '../orders-core.js';

export async function paymentRoutes(app: App) {
  const deps = app.deps;
  const { db, payments, cfg } = deps;

  /**
   * Webhook аз провайдер. Имзо (HMAC-SHA256) аз рӯи бадани ХОМ (raw body) санҷида мешавад.
   * Idempotent: такрори ҳамон рӯйдод ҳеҷ чизро тағйир намедиҳад (бонкҳо webhook-ро такрор мефиристанд).
   */
  async function handleWebhook(rawBody: string, signature: string | undefined) {
    const ev = payments.verifyWebhook(rawBody, signature);
    if (!ev) throw new HttpError(401, 'bad_signature');
    const { rows } = await db.query(
      `UPDATE payments SET status = $2, updated_at = now() WHERE provider_ref = $1 AND status = 'pending' RETURNING order_id`,
      [ev.ref, ev.status],
    );
    if (!rows[0]) return { ok: true, duplicate: true };
    const orderId = rows[0].order_id as number;
    await db.query('UPDATE orders SET payment_status = $2 WHERE id = $1', [orderId, ev.status]);
    try {
      await transition(deps, orderId, ev.status === 'paid' ? 'created' : 'cancelled', 'system', null);
    } catch (e) {
      // Мизоҷ то омадани webhook фармоишро бекор кард, вале пул гирифта шуд → баргардонидан
      if (ev.status === 'paid' && e instanceof HttpError && e.code === 'invalid_transition') {
        await payments.refund(ev.ref, (await db.query('SELECT amount FROM payments WHERE provider_ref = $1', [ev.ref])).rows[0].amount);
        await db.query(`UPDATE payments SET status = 'refunded' WHERE provider_ref = $1`, [ev.ref]);
        await db.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId]);
      } else throw e;
    }
    return { ok: true };
  }

  app.post('/payments/webhook', async (req) => handleWebhook(req.rawBody ?? '', req.headers['x-signature'] as string | undefined));

  if (payments.name !== 'mock') return;

  // ───── Саҳифаи санҷишии бонк (танҳо провайдери mock) ─────
  app.get('/payments/mock/:ref', async (req, reply) => {
    const { ref } = z.object({ ref: z.string().regex(/^mock_[0-9a-f-]{36}$/) }).parse(req.params);
    const p = (await db.query('SELECT amount, status FROM payments WHERE provider_ref = $1', [ref])).rows[0];
    if (!p) throw new HttpError(404, 'payment_not_found');
    const amount = (p.amount / 100).toFixed(2);
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="tg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пардохти санҷишӣ</title><style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#16181D}
.card{border:1px solid #E5E7EB;border-radius:14px;padding:20px}button{width:100%;padding:14px;border:0;border-radius:12px;font-size:16px;margin-top:10px;cursor:pointer}
.pay{background:#0F9D58;color:#fff}.fail{background:#fff;border:1px solid #D32F2F;color:#D32F2F}.muted{color:#6B7280;font-size:13px}</style></head>
<body><div class="card"><p class="muted">РЕҶАИ САНҶИШӢ — пул гирифта намешавад</p><h2>Тезрасон</h2><p>Маблағ: <b>${amount} с.</b></p><p class="muted">Ҳолат: ${p.status}</p>
${p.status === 'pending' ? `<form method="post" action="/payments/mock/${ref}/complete"><button class="pay" name="status" value="paid">Пардохт кардан</button><button class="fail" name="status" value="failed">Рад кардан</button></form>` : '<p>Анҷом ёфт. Ба барнома баргардед.</p>'}
</div></body></html>`;
  });

  /** «Бонк» натиҷаро бо имзо ба webhook мефиристад */
  app.post('/payments/mock/:ref/complete', async (req, reply) => {
    const { ref } = z.object({ ref: z.string() }).parse(req.params);
    const { status } = z.object({ status: z.enum(['paid', 'failed']) }).parse(req.body);
    const raw = JSON.stringify({ ref, status });
    await handleWebhook(raw, sign(cfg.paymentWebhookSecret, raw));
    return reply.redirect(`/payments/mock/${ref}`, 303);
  });
}
