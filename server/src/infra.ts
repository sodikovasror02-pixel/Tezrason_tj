import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { Redis } from 'ioredis';

export type Config = {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  isProd: boolean;
  adminPhones: string[];
  dispatchRadiusKm: number;
  /** Суроғаи OSRM; холӣ → ҳисоби тахминӣ */
  osrmUrl: string | null;
  /** t = t_osrm · k (OSRM вақтро бе трафик медиҳад) */
  trafficFactor: number;
  /** Суроғаи берунии сервер (барои пайвандҳои пардохт) */
  publicUrl: string;
  paymentWebhookSecret: string;
};

export function loadConfig(env = process.env): Config {
  const isProd = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (isProd ? '' : 'dev-secret-change-me');
  if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET (≥32 аломат) дар production ҳатмист');
  if (isProd && !env.PAYMENT_WEBHOOK_SECRET) throw new Error('PAYMENT_WEBHOOK_SECRET дар production ҳатмист');
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://hizmat:hizmat@localhost:5432/hizmat',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    jwtSecret,
    isProd,
    adminPhones: (env.ADMIN_PHONES ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
    dispatchRadiusKm: Number(env.DISPATCH_RADIUS_KM ?? 5),
    osrmUrl: env.OSRM_URL || null,
    trafficFactor: Number(env.TRAFFIC_FACTOR ?? 1.3),
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, ''),
    paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? (isProd ? '' : 'dev-webhook-secret'),
  };
}

// BIGINT (int8) → number. ID-ҳо то 2⁵³ бехатаранд; бе ин pg string бармегардонад.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export const createDb = (url: string): Db => new pg.Pool({ connectionString: url, max: 10 });

/** Транзаксия: BEGIN … COMMIT / ROLLBACK */
export async function tx<T>(db: Db, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Миграцияҳои оддӣ: файлҳои migrations/*.sql бо тартиби ном, як маротиба */
export async function migrate(db: Db, dir = path.join(import.meta.dirname, '..', 'migrations')): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), 'utf8');
    await tx(db, async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    applied.push(f);
  }
  return applied;
}

export const createRedis = (url: string) => new Redis(url, { maxRetriesPerRequest: 3 });
export type RedisClient = Redis;

/** Хатои бизнес-логика → HTTP код */
export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message?: string) {
    super(message ?? code);
  }
}
