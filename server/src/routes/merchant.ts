import { z } from 'zod';
import type { App } from '../app.js';
import { HttpError } from '../infra.js';
import { Id } from './orders.js';

/** Панели тарабхона: ҳолат (кушода/пӯшида), вақти омодасозӣ, меню ва нархҳо */
export async function merchantRoutes(app: App) {
  const { db } = app.deps;
  const onlyMerchant = async (req: Parameters<App['auth']>[0], reply: Parameters<App['auth']>[1]) => {
    await app.auth(req, reply);
    if (req.me.role !== 'merchant' || !req.me.merchant_id) throw new HttpError(403, 'forbidden');
  };

  app.get('/merchant', { preHandler: onlyMerchant }, async (req) => {
    const m = (await db.query(`SELECT *, rating::float AS rating, delivery_radius_km::float AS delivery_radius_km FROM merchants WHERE id = $1`, [req.me.merchant_id])).rows[0];
    const p = await db.query('SELECT * FROM products WHERE merchant_id = $1 ORDER BY id', [req.me.merchant_id]);
    return { ...m, products: p.rows };
  });

  app.patch('/merchant', { preHandler: onlyMerchant }, async (req) => {
    const b = z
      .object({
        is_open: z.boolean().optional(),
        prep_min: z.number().int().min(5).max(180).optional(),
        min_order: z.number().int().min(0).max(1_000_000).optional(),
      })
      .parse(req.body);
    const { rows } = await db.query(
      `UPDATE merchants SET is_open = COALESCE($2, is_open), prep_min = COALESCE($3, prep_min), min_order = COALESCE($4, min_order)
       WHERE id = $1 RETURNING id, is_open, prep_min, min_order`,
      [req.me.merchant_id, b.is_open ?? null, b.prep_min ?? null, b.min_order ?? null],
    );
    return rows[0];
  });

  const ProductInput = z.object({
    name_tj: z.string().trim().min(1).max(80),
    name_ru: z.string().trim().min(1).max(80),
    price: z.number().int().min(100).max(10_000_000), // дирам, ≥ 1 с.
    emoji: z.string().max(8).optional().nullable(),
    category: z.string().max(30).optional().nullable(),
    unit_tj: z.string().max(20).optional().nullable(),
    unit_ru: z.string().max(20).optional().nullable(),
    available: z.boolean().optional(),
  });

  app.post('/merchant/products', { preHandler: onlyMerchant }, async (req, reply) => {
    const b = ProductInput.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO products (merchant_id, name_tj, name_ru, price, emoji, category, unit_tj, unit_ru, available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.me.merchant_id, b.name_tj, b.name_ru, b.price, b.emoji ?? null, b.category ?? null, b.unit_tj ?? null, b.unit_ru ?? null, b.available ?? true],
    );
    return reply.code(201).send(rows[0]);
  });

  /** Тағйири маҳсулот. Фармоишҳои пешина нархи худро нигоҳ медоранд (snapshot дар order_items). */
  app.patch('/merchant/products/:id', { preHandler: onlyMerchant }, async (req) => {
    const { id } = Id.parse(req.params);
    const b = ProductInput.partial().parse(req.body);
    const cols = Object.entries(b).filter(([, v]) => v !== undefined);
    if (!cols.length) throw new HttpError(400, 'validation');
    const set = cols.map(([k], i) => `${k} = $${i + 3}`).join(', ');
    const { rows } = await db.query(`UPDATE products SET ${set} WHERE id = $1 AND merchant_id = $2 RETURNING *`, [id, req.me.merchant_id, ...cols.map(([, v]) => v)]);
    if (!rows[0]) throw new HttpError(404, 'product_not_found'); // маҳсулоти тарабхонаи дигар — 404
    return rows[0];
  });
}
