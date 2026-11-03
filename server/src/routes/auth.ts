import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { App } from '../app.js';
import { HttpError } from '../infra.js';

const OTP_TTL_S = 300; // 5 дақ
const OTP_RESEND_S = 60; // такрор на зудтар аз 60 с
const OTP_MAX_ATTEMPTS = 5;

const Phone = z.string().regex(/^\+992\d{9}$/, 'Формат: +992XXXXXXXXX');
const hash = (code: string, phone: string) => createHash('sha256').update(`${code}:${phone}`).digest('hex');

export async function authRoutes(app: App) {
  const { db, redis, sms, cfg } = app.deps;

  /** 1) Дархости рамз ба SMS */
  app.post('/auth/otp/request', async (req) => {
    const { phone } = z.object({ phone: Phone }).parse(req.body);
    const isTestPhone = cfg.otpTestPhones.includes(phone);
    // Production бе SMS-и воқеӣ: танҳо рақамҳои тестӣ (вагарна рамз ба ҳеҷ ҷо намерасад)
    if (cfg.isProd && !sms.real && !isTestPhone) throw new HttpError(503, 'sms_unavailable');
    // Ҳимоя аз спам: як SMS дар 60 с ба як рақам (Redis SET NX EX)
    const ok = await redis.set(`otp:throttle:${phone}`, '1', 'EX', OTP_RESEND_S, 'NX');
    if (!ok) throw new HttpError(429, 'otp_throttled', `Баъд аз ${OTP_RESEND_S} с такрор кунед`);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts)
       VALUES ($1, $2, now() + make_interval(secs => $3), 0)
       ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
      [phone, hash(code, phone), OTP_TTL_S],
    );
    await sms.send(phone, `Тезрасон: рамзи шумо ${code}`);
    // Дар development ва барои рақамҳои тестӣ рамз дар ҷавоб бармегардад
    return { ok: true, ttl: OTP_TTL_S, ...(!cfg.isProd || isTestPhone ? { devCode: code } : {}) };
  });

  /** 2) Тасдиқи рамз → JWT */
  app.post('/auth/otp/verify', async (req) => {
    const { phone, code } = z.object({ phone: Phone, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const { rows } = await db.query(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1
       RETURNING code_hash, attempts, expires_at > now() AS alive`,
      [phone],
    );
    const row = rows[0];
    if (!row || !row.alive) throw new HttpError(400, 'otp_expired');
    if (row.attempts > OTP_MAX_ATTEMPTS) throw new HttpError(429, 'otp_too_many_attempts');
    const a = Buffer.from(row.code_hash, 'hex');
    const b = Buffer.from(hash(code, phone), 'hex');
    if (!timingSafeEqual(a, b)) throw new HttpError(400, 'otp_invalid');
    await db.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);

    const role = cfg.adminPhones.includes(phone) ? 'admin' : 'customer';
    const { rows: users } = await db.query(
      `INSERT INTO users (phone, role) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, phone, name, role, merchant_id`,
      [phone, role],
    );
    const user = users[0];
    const token = app.jwt.sign({ sub: String(user.id) }, { expiresIn: '30d' });
    return { token, user };
  });

  app.get('/me', { preHandler: app.auth }, async (req) => req.me);

  app.patch('/me', { preHandler: app.auth }, async (req) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const { rows } = await db.query('UPDATE users SET name = $2 WHERE id = $1 RETURNING id, phone, name, role, merchant_id', [req.me.id, name]);
    return rows[0];
  });

  /** Админ: таъини нақш (курьер, тарабхона) */
  app.patch('/admin/users/:id', { preHandler: app.auth }, async (req) => {
    if (req.me.role !== 'admin') throw new HttpError(403, 'forbidden');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const body = z
      .object({
        role: z.enum(['customer', 'courier', 'merchant', 'admin']),
        merchantId: z.number().int().nullable().optional(),
      })
      .refine((b) => b.role !== 'merchant' || b.merchantId, 'merchantId барои merchant ҳатмист')
      .parse(req.body);
    const { rows } = await db.query(
      'UPDATE users SET role = $2, merchant_id = $3 WHERE id = $1 RETURNING id, phone, name, role, merchant_id',
      [id, body.role, body.role === 'merchant' ? body.merchantId : null],
    );
    if (!rows[0]) throw new HttpError(404, 'user_not_found');
    return rows[0];
  });
}
