import { z } from 'zod';
import type { App } from '../app.js';
import { HttpError } from '../infra.js';
import { AddressInput, Id } from './orders.js';

const MAX_ADDRESSES = 10;
const Input = AddressInput.extend({ label: z.string().trim().min(1).max(40) });

/** Суроғаҳои нигоҳдошташудаи мизоҷ */
export async function addressRoutes(app: App) {
  const { db } = app.deps;
  const cols = 'id, label, address AS text, lat, lon, entrance, floor, apartment, comment';

  app.get('/addresses', { preHandler: app.auth }, async (req) =>
    (await db.query(`SELECT ${cols} FROM user_addresses WHERE user_id = $1 ORDER BY id`, [req.me.id])).rows,
  );

  app.post('/addresses', { preHandler: app.auth }, async (req, reply) => {
    const b = Input.parse(req.body);
    const n = (await db.query('SELECT count(*)::int AS n FROM user_addresses WHERE user_id = $1', [req.me.id])).rows[0].n;
    if (n >= MAX_ADDRESSES) throw new HttpError(409, 'too_many_addresses');
    const { rows } = await db.query(
      `INSERT INTO user_addresses (user_id, label, address, lat, lon, entrance, floor, apartment, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${cols}`,
      [req.me.id, b.label, b.text, b.lat, b.lon, b.entrance ?? null, b.floor ?? null, b.apartment ?? null, b.comment ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  app.delete('/addresses/:id', { preHandler: app.auth }, async (req) => {
    const { id } = Id.parse(req.params);
    const r = await db.query('DELETE FROM user_addresses WHERE id = $1 AND user_id = $2', [id, req.me.id]);
    if (!r.rowCount) throw new HttpError(404, 'address_not_found');
    return { ok: true };
  });
}
