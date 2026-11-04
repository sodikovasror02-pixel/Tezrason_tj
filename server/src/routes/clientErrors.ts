import { z } from 'zod';
import type { App } from '../app.js';
import { HttpError } from '../infra.js';

/**
 * Ҳисоботи хатоҳои барнома (plugins/withCrashReporter.js).
 * Бе воридшавӣ — барнома метавонад пеш аз воридшавӣ қатъ шавад.
 * Ҳимоя: бадан ≤ 64 KB, ≤ 30 ҳисобот/дақ аз як IP. Танҳо ба лог навишта мешавад.
 */
const Report = z.object({
  source: z.string().max(40),
  message: z.string().max(4000),
  stack: z.string().max(40000).optional(),
  thread: z.string().max(200).optional(),
  device: z.string().max(200).optional(),
  android: z.string().max(100).optional(),
  app: z.string().max(50).nullable().optional(),
});

export async function clientErrorRoutes(app: App) {
  const { redis } = app.deps;
  app.post('/client-errors', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    const key = `client-errors:${req.ip}:${Math.floor(Date.now() / 60000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 120);
    if (n > 30) throw new HttpError(429, 'too_many_reports');
    const r = Report.parse(req.body);
    req.log.error({ clientError: r }, `CLIENT CRASH: ${r.message}`);
    return reply.code(204).send();
  });
}
