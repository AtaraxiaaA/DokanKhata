// credit sales, mounted at /api/shops/:shopId/sales
import { Hono } from 'hono';
import { newSaleSchema } from '@dokankhata/shared';
import { callProc, queryOne, withConn } from '../db';
import { forbidden, notImplemented } from '../errors';
import { requireShopAccess } from '../auth/guards';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

export const saleRoutes = new Hono<AppEnv>()
  // POST / - record a credit sale through sp_record_credit_sale.
  // all the writes work like this: validate, check the record is ours, withConn, call the procedure.
  // if the DB refuses (limit, stock, blocked) the error handler turns it into a 422
  .post(
    '/',
    requireShopAccess({ canGiveCredit: true }),
    validate('json', newSaleSchema),
    async (c) => {
      const { shopCustomerId, items, note } = c.req.valid('json');
      const user = c.get('user');
      const shopId = c.get('shop').shopId;

      // the account has to be at this shop, not just any shop the user works at
      const acct = await queryOne<{ shopId: number }>(
        'SELECT shop_id FROM shop_customers WHERE shop_customer_id = ?',
        [shopCustomerId],
      );
      if (acct?.shopId !== shopId) throw forbidden('This customer account is not at this shop');

      const cart = JSON.stringify(
        items.map((i) => ({ shop_product_id: i.shopProductId, qty: i.qty })),
      );
      const sale = await withConn(user.fullName, async (conn) => {
        const saleId = await callProc<number>(conn, 'sp_record_credit_sale', [
          shopCustomerId,
          user.userId,
          cart,
          note || null,
        ]);
        return queryOne<{ saleId: number; totalAmount: number; dueDate: string; soldAt: string }>(
          'SELECT sale_id, total_amount, due_date, sold_at FROM credit_sales WHERE sale_id = ?',
          [saleId],
          conn,
        );
      });
      return c.json(sale!, 201);
    },
  )
  // GET /?status=&from=&to=&shopCustomerId= - sales history
  .get('/', notImplemented('Member 2'))
  // GET /:saleId - sale with items, allocations, adjustments, disputes
  .get('/:saleId', notImplemented('Member 2'))
  // PATCH /:saleId/due-date - extend a due date (trigger refuses bringing it forward). Manager only.
  .patch('/:saleId/due-date', notImplemented('Member 2'));
