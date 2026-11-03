import { z } from 'zod';
import type { App } from '../app.js';
import { HttpError } from '../infra.js';

export async function catalogRoutes(app: App) {
  const { db } = app.deps;

  app.get('/merchants', async (req) => {
    const { kind } = z.object({ kind: z.enum(['restaurant', 'market']).optional() }).parse(req.query);
    const { rows } = await db.query(
      `SELECT id, kind, name, cuisine_tj, cuisine_ru, emoji, lat, lon, rating::float AS rating, prep_min, is_open, delivery_radius_km::float AS delivery_radius_km, min_order
       FROM merchants WHERE ($1::text IS NULL OR kind = $1) ORDER BY rating DESC, id`,
      [kind ?? null],
    );
    return rows;
  });

  app.get('/merchants/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const m = await db.query(
      `SELECT id, kind, name, cuisine_tj, cuisine_ru, emoji, lat, lon, rating::float AS rating, prep_min, is_open, delivery_radius_km::float AS delivery_radius_km, min_order
       FROM merchants WHERE id = $1`,
      [id],
    );
    if (!m.rows[0]) throw new HttpError(404, 'merchant_not_found');
    const p = await db.query(
      `SELECT id, name_tj, name_ru, unit_tj, unit_ru, category, emoji, price, available
       FROM products WHERE merchant_id = $1 ORDER BY id`,
      [id],
    );
    return { ...m.rows[0], products: p.rows };
  });

}
