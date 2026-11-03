import type { WebSocket } from 'ws';
import { RedisClient } from './infra.js';

/**
 * Real-time: Redis Pub/Sub → WebSocket.
 * Ҳар инстансияи сервер ба `rt:*` обуна мешавад, бинобар ин паём ба
 * корбар мерасад, новобаста аз он ки WS-и ӯ ба кадом инстансия пайваст аст
 * (горизонталӣ масштаб мешавад).
 *
 * Каналҳо: rt:user:<id>, rt:merchant:<id>
 */
export class Realtime {
  private sockets = new Map<string, Set<WebSocket>>();

  constructor(private pub: RedisClient, private sub: RedisClient) {}

  async start() {
    await this.sub.psubscribe('rt:*');
    this.sub.on('pmessage', (_p, channel, message) => {
      const key = channel.slice(3);
      for (const ws of this.sockets.get(key) ?? []) if (ws.readyState === 1) ws.send(message);
    });
  }

  attach(keys: string[], ws: WebSocket) {
    for (const k of keys) {
      if (!this.sockets.has(k)) this.sockets.set(k, new Set());
      this.sockets.get(k)!.add(ws);
    }
    ws.on('close', () => {
      for (const k of keys) {
        const set = this.sockets.get(k);
        set?.delete(ws);
        if (set && !set.size) this.sockets.delete(k);
      }
    });
  }

  async publish(key: string, event: string, data: unknown) {
    await this.pub.publish(`rt:${key}`, JSON.stringify({ event, data }));
  }
}
