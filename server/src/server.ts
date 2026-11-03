import { buildApp } from './app.js';
import { createDb, createRedis, loadConfig, migrate } from './infra.js';
import { Realtime } from './realtime.js';
import { ConsoleSms } from './sms.js';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
const redis = createRedis(cfg.redisUrl);
const rt = new Realtime(redis, createRedis(cfg.redisUrl)); // pub/sub пайвасти алоҳида талаб мекунад
await rt.start();

const applied = await migrate(db);
if (applied.length) console.log('migrations applied:', applied.join(', '));

const app = await buildApp({ cfg, db, redis, rt, sms: new ConsoleSms() }, { logger: true });
await app.listen({ port: cfg.port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await app.close();
    await db.end();
    redis.disconnect();
    process.exit(0);
  });
