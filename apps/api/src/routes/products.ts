// a shop's price list, mounted at /api/shops/:shopId/products
import { Hono } from 'hono';
import { z } from 'zod';
import type { ShopProductRow } from '@dokankhata/shared';
import { query } from '../db';
import { notImplemented } from '../errors';
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
  // GET /catalog?q= - shared catalog products this shop doesn't sell yet
  .get('/catalog', notImplemented('Member 3'))
  // POST / - add a catalog product to this shop with price + stock. Manager only.
  .post('/', notImplemented('Member 3'))
  // PATCH /:shopProductId - price, stock, reorder level, active. Manager only.
  .patch('/:shopProductId', notImplemented('Member 3'));
