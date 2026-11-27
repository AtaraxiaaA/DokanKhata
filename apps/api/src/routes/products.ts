// a shop's price list, mounted at /api/shops/:shopId/products
import { Hono } from 'hono';
import { z } from 'zod';
import {
  addShopProductSchema,
  updateShopProductSchema,
  type ShopProductRow,
} from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { execute, query, withConn } from '../db';
import { notFound } from '../errors';
import { paramId } from '../lib/ownership';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

export const productRoutes = new Hono<AppEnv>()
  // GET /api/shops/:shopId/products?q= - active items with price + stock
  .get('/', validate('query', z.object({ q: z.string().trim().optional() })), async (c) => {
    const { q } = c.req.valid('query');
    const params: unknown[] = [c.get('shop').shopId];
    let sqlSearch = '';
    if (q) {
      sqlSearch = 'AND (p.name LIKE ? OR p.bangla_name LIKE ? OR p.brand LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const rows = await query<Omit<ShopProductRow, 'trackStock'> & { trackStock: number }>(
      `SELECT sp.shop_product_id, p.product_id, p.name, p.bangla_name, p.brand, p.unit,
              cat.name AS category, sp.sell_price, sp.stock_qty, sp.track_stock
         FROM shop_products sp
         JOIN products p    ON p.product_id = sp.product_id
         JOIN categories cat ON cat.category_id = p.category_id
        WHERE sp.shop_id = ? AND sp.is_active = 1 ${sqlSearch}
        ORDER BY cat.name, p.name`,
      params,
    );
    return c.json(rows.map((r): ShopProductRow => ({ ...r, trackStock: r.trackStock === 1 })));
  })
  // GET /catalog?q=&categoryId= - things from the shared catalog this shop doesn't sell yet
  .get(
    '/catalog',
    validate(
      'query',
      z.object({
        q: z.string().trim().optional(),
        categoryId: z.coerce.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      const { q, categoryId } = c.req.valid('query');
      const params: unknown[] = [c.get('shop').shopId];
      const where: string[] = [];
      if (q) {
        where.push('(p.name LIKE ? OR p.bangla_name LIKE ? OR p.brand LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (categoryId) {
        where.push('p.category_id = ?');
        params.push(categoryId);
      }
      const sqlWhere = where.length ? 'AND ' + where.join(' AND ') : '';
      const rows = await query<{
        productId: number;
        name: string;
        banglaName: string | null;
        brand: string;
        unit: string;
        categoryId: number;
        category: string;
      }>(
        `SELECT p.product_id, p.name, p.bangla_name, p.brand, p.unit, p.category_id, cat.name AS category
           FROM products p
           JOIN categories cat ON cat.category_id = p.category_id
          WHERE NOT EXISTS (SELECT 1 FROM shop_products sp WHERE sp.product_id = p.product_id AND sp.shop_id = ?)
            ${sqlWhere}
          ORDER BY cat.name, p.name`,
        params,
      );
      return c.json(rows);
    },
  )

  // GET /all - the full price list including inactive items (for the price & stock page)
  .get('/all', async (c) => {
    const rows = await query<
      Omit<ShopProductRow, 'trackStock'> & {
        trackStock: number;
        isActive: number;
        reorderLevel: number;
        updatedAt: string;
      }
    >(
      `SELECT sp.shop_product_id, p.product_id, p.name, p.bangla_name, p.brand, p.unit,
              cat.name AS category, sp.sell_price, sp.stock_qty, sp.reorder_level, sp.track_stock,
              sp.is_active, sp.updated_at
         FROM shop_products sp
         JOIN products p     ON p.product_id = sp.product_id
         JOIN categories cat ON cat.category_id = p.category_id
        WHERE sp.shop_id = ?
        ORDER BY sp.is_active DESC, cat.name, p.name`,
      [c.get('shop').shopId],
    );
    return c.json(
      rows.map((r) => ({
        ...r,
        trackStock: r.trackStock === 1,
        isActive: r.isActive === 1,
        lowStock: r.trackStock === 1 && r.stockQty <= r.reorderLevel,
      })),
    );
  })

  // POST / - start selling a catalog product here. owner or manager
  .post(
    '/',
    requireShopAccess({ manager: true }),
    validate('json', addShopProductSchema),
    async (c) => {
      const b = c.req.valid('json');
      const r = await withConn(c.get('user').fullName, (conn) =>
        execute(
          `INSERT INTO shop_products (shop_id, product_id, sell_price, stock_qty, reorder_level, track_stock)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            c.get('shop').shopId,
            b.productId,
            b.sellPrice,
            b.stockQty,
            b.reorderLevel,
            b.trackStock ? 1 : 0,
          ],
          conn,
        ),
      );
      return c.json({ shopProductId: r.insertId }, 201);
    },
  )

  // PATCH /:shopProductId - price, stock, reorder level, on/off. owner or manager.
  // changing the price doesn't touch old bills, they keep the price from the day of the sale
  .patch(
    '/:shopProductId',
    requireShopAccess({ manager: true }),
    validate('json', updateShopProductSchema),
    async (c) => {
      const id = paramId(c, 'shopProductId');
      const b = c.req.valid('json');
      const cols: [string, unknown][] = [];
      if (b.sellPrice !== undefined) cols.push(['sell_price', b.sellPrice]);
      if (b.stockQty !== undefined) cols.push(['stock_qty', b.stockQty]);
      if (b.reorderLevel !== undefined) cols.push(['reorder_level', b.reorderLevel]);
      if (b.trackStock !== undefined) cols.push(['track_stock', b.trackStock ? 1 : 0]);
      if (b.isActive !== undefined) cols.push(['is_active', b.isActive ? 1 : 0]);
      if (!cols.length) return c.json({ ok: true });

      const sqlSet = cols.map(([col]) => `${col} = ?`).join(', ');
      const r = await withConn(c.get('user').fullName, (conn) =>
        execute(
          `UPDATE shop_products SET ${sqlSet} WHERE shop_product_id = ? AND shop_id = ?`,
          [...cols.map(([, v]) => v), id, c.get('shop').shopId],
          conn,
        ),
      );
      if (!r.affectedRows) throw notFound('Product');
      return c.json({ ok: true });
    },
  );
