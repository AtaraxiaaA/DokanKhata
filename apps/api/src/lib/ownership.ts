// small checks so nobody can reach another shop's data by changing an id in the URL
import type { Context } from 'hono';
import { queryOne, type Conn } from '../db';
import { AppError, notFound } from '../errors';

// reads a numeric id from the URL, 400 if it isn't one
export function paramId(c: Context, name: string): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, 'VALIDATION', `Bad ${name}`);
  return n;
}

// account must exist and be at this shop. returns it so callers don't query again
export async function accountInShop(shopCustomerId: number, shopId: number, conn?: Conn) {
  const acct = await queryOne<{ shopCustomerId: number; customerId: number; status: string }>(
    'SELECT shop_customer_id, customer_id, status FROM shop_customers WHERE shop_customer_id = ? AND shop_id = ?',
    [shopCustomerId, shopId],
    conn,
  );
  if (!acct) throw notFound('Customer account');
  return acct;
}

// same idea for a sale
export async function saleInShop(saleId: number, shopId: number, conn?: Conn) {
  const sale = await queryOne<{ saleId: number; shopCustomerId: number; customerId: number }>(
    `SELECT cs.sale_id, cs.shop_customer_id, sc.customer_id
       FROM credit_sales cs
       JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
      WHERE cs.sale_id = ? AND sc.shop_id = ?`,
    [saleId, shopId],
    conn,
  );
  if (!sale) throw notFound('Sale');
  return sale;
}
