import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Интерфейси провайдери пардохт. Барои production — пайваст ба бонк/агрегатор
 * (масалан, Корти Миллӣ тавассути бонки эквайер, Alif, DC). Ҳар провайдер:
 *   1) сессияи пардохт месозад → checkoutUrl (саҳифаи бонк);
 *   2) натиҷаро тавассути webhook бо имзо (HMAC) мефиристад;
 *   3) баргардонидани пулро (refund) дастгирӣ мекунад.
 */
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PaymentProvider {
  readonly name: string;
  createPayment(p: { orderId: number; amount: number }): Promise<{ ref: string; checkoutUrl: string }>;
  /** null — имзо нодуруст */
  verifyWebhook(rawBody: string, signature: string | undefined): { ref: string; status: 'paid' | 'failed' } | null;
  refund(ref: string, amount: number): Promise<void>;
}

export const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');

/**
 * Провайдери санҷишӣ: саҳифаи /payments/mock/:ref бо тугмаҳои «Пардохт» / «Рад»,
 * ки webhook-и имзошударо ба худи сервер мефиристад — ҳамон тавре ки бонк мекунад.
 */
export class MockPayments implements PaymentProvider {
  readonly name = 'mock';
  refunds: { ref: string; amount: number }[] = [];
  constructor(private publicUrl: string, private secret: string) {}

  async createPayment() {
    const ref = `mock_${randomUUID()}`;
    return { ref, checkoutUrl: `${this.publicUrl.replace(/\/$/, '')}/payments/mock/${ref}` };
  }

  verifyWebhook(rawBody: string, signature: string | undefined): { ref: string; status: 'paid' | 'failed' } | null {
    if (!signature) return null;
    const a = Buffer.from(sign(this.secret, rawBody), 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(rawBody) as { ref?: unknown; status?: unknown };
    if (typeof body.ref !== 'string' || (body.status !== 'paid' && body.status !== 'failed')) return null;
    return { ref: body.ref, status: body.status as 'paid' | 'failed' };
  }

  async refund(ref: string, amount: number) {
    this.refunds.push({ ref, amount });
  }
}
