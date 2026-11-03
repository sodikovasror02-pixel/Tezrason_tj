import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fjwt from '@fastify/jwt';
import fws from '@fastify/websocket';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { Config, Db, HttpError, RedisClient } from './infra.js';
import { Realtime } from './realtime.js';
import { SmsSender } from './sms.js';
import type { Router } from './routing.js';
import type { PaymentProvider } from './payments.js';
import type { Dispatcher } from './dispatch.js';
import type { Role } from './domain/status.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { courierRoutes } from './routes/courier.js';
import { merchantRoutes } from './routes/merchant.js';
import { addressRoutes } from './routes/addresses.js';
import { paymentRoutes } from './routes/payments.js';

export type Me = { id: number; phone: string; name: string | null; role: Role; merchant_id: number | null };
export type Deps = { cfg: Config; db: Db; redis: RedisClient; rt: Realtime; sms: SmsSender; router: Router; payments: PaymentProvider; dispatcher: Dispatcher };
export type App = FastifyInstance & {
  deps: Deps;
  auth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

declare module 'fastify' {
  interface FastifyRequest {
    me: Me;
    /** Бадани хоми дархост — барои санҷиши имзои webhook */
    rawBody?: string;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}): Promise<App> {
  const app = Fastify({ logger: opts.logger ?? false }) as unknown as App;
  app.decorate('deps', deps);
  app.decorateRequest('me', null as unknown as Me);

  // Методҳо ба таври возеҳ: пешфарзи @fastify/cors PATCH/DELETE-ро дар preflight иҷозат намедиҳад
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });

  // JSON бо нигоҳ доштани бадани хом (HMAC-и webhook); бадани холӣ → {}
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch {
      done(Object.assign(new Error('invalid_json'), { statusCode: 400 }), undefined);
    }
  });
  // Формаи HTML (саҳифаи санҷишии пардохт)
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });
  await app.register(fjwt, { secret: deps.cfg.jwtSecret });
  await app.register(fws);

  async function loadMe(sub: string): Promise<Me | null> {
    const { rows } = await deps.db.query('SELECT id, phone, name, role, merchant_id FROM users WHERE id = $1', [sub]);
    if (!rows[0]) return null;
    return { ...rows[0], id: Number(rows[0].id), merchant_id: rows[0].merchant_id && Number(rows[0].merchant_id) };
  }

  /** Нақш ҳар дафъа аз база хонда мешавад — тағйири нақш фавран амал мекунад */
  app.decorate('auth', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'unauthorized');
    }
    const me = await loadMe(req.user.sub);
    if (!me) throw new HttpError(401, 'unauthorized');
    req.me = me;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation', issues: err.issues });
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'bad_request', message: e.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  // Саҳифаи асосӣ — то кушодани суроға дар браузер «404» набошад
  app.get('/', async () => ({ name: 'Тезрасон API', ok: true, health: '/health' }));

  app.get('/health', async () => {
    await deps.db.query('SELECT 1');
    await deps.redis.ping();
    return { ok: true };
  });

  /**
   * WebSocket: ws://host/ws?token=JWT
   * Рӯйдодҳо: order.new, order.status, ride.offer, driver.location
   */
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    let me: Me | null = null;
    try {
      me = token ? await loadMe(app.jwt.verify<{ sub: string }>(token).sub) : null;
    } catch {
      me = null;
    }
    if (!me) return socket.close(4401, 'unauthorized');
    const keys = [`user:${me.id}`];
    if (me.role === 'merchant' && me.merchant_id) keys.push(`merchant:${me.merchant_id}`);
    deps.rt.attach(keys, socket);
    socket.send(JSON.stringify({ event: 'hello', data: { userId: me.id, role: me.role } }));
  });

  await authRoutes(app);
  await catalogRoutes(app);
  await orderRoutes(app);
  await courierRoutes(app);
  await merchantRoutes(app);
  await addressRoutes(app);
  await paymentRoutes(app);
  return app;
}
