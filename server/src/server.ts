import { buildApp } from './app.js';
import { createDb, createRedis, loadConfig, migrate } from './infra.js';
import { Realtime } from './realtime.js';
import { ConsoleSms } from './sms.js';
import { CachedRouter, EstimateRouter, OsrmRouter } from './routing.js';
import { MockPayments } from './payments.js';
import { Dispatcher } from './dispatch.js';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
const redis = createRedis(cfg.redisUrl);
const rt = new Realtime(redis, createRedis(cfg.redisUrl)); // pub/sub пайвасти алоҳида талаб мекунад
await rt.start();

const applied = await migrate(db);
if (applied.length) console.log('migrations applied:', applied.join(', '));

const estimate = new EstimateRouter();
const router = new CachedRouter(
  cfg.osrmUrl ? new OsrmRouter(cfg.osrmUrl, { trafficFactor: cfg.trafficFactor, timeoutMs: 3000, fallback: estimate }) : estimate,
  redis,
);
console.log(`routing: ${cfg.osrmUrl ?? 'estimate (OSRM_URL холӣ)'}`);

// Провайдери воқеии пардохт бояд PaymentProvider-ро амалӣ кунад (ниг. src/payments.ts)
const payments = new MockPayments(cfg.publicUrl, cfg.paymentWebhookSecret);
const dispatcher = new Dispatcher({ db, redis, rt, router, radiusKm: cfg.dispatchRadiusKm });
dispatcher.start();

const app = await buildApp({ cfg, db, redis, rt, sms: new ConsoleSms(), router, payments, dispatcher }, { logger: true });
await app.listen({ port: cfg.port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    dispatcher.stop();
    await app.close();
    await db.end();
    redis.disconnect();
    process.exit(0);
  });
