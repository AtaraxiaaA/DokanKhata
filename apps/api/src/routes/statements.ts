// monthly statements, mounted at /api/shops/:shopId/statements
import { Hono } from 'hono';
import { z } from 'zod';
import { dateSchema } from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { query, withConn } from '../db';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

const monthQuery = z.object({ month: dateSchema.optional() });

export const statementRoutes = new Hono<AppEnv>()
  // GET /months - months that have statements, newest first (for the month picker)
  .get('/months', async (c) => {
    const rows = await query<{ month: string; accounts: number }>(
      `SELECT ms.statement_month AS month, COUNT(*) AS accounts
         FROM monthly_statements ms
         JOIN shop_customers sc ON sc.shop_customer_id = ms.shop_customer_id
        WHERE sc.shop_id = ?
        GROUP BY ms.statement_month
        ORDER BY ms.statement_month DESC`,
      [c.get('shop').shopId],
    );
    return c.json(rows);
  })

  // GET /?month=YYYY-MM-01 - defaults to last month
  .get('/', validate('query', monthQuery), async (c) => {
    const { month } = c.req.valid('query');
    const rows = await query<{
      statementId: number;
      shopCustomerId: number;
      customerName: string;
      phone: string;
      statementMonth: string;
      openingBalance: number;
      creditTotal: number;
      paidTotal: number;
      adjustmentTotal: number;
      closingBalance: number;
      generatedAt: string;
    }>(
      `SELECT ms.statement_id, ms.shop_customer_id, c.full_name AS customer_name, c.phone, ms.statement_month,
              ms.opening_balance, ms.credit_total, ms.paid_total, ms.adjustment_total, ms.closing_balance,
              ms.generated_at
         FROM monthly_statements ms
         JOIN shop_customers sc ON sc.shop_customer_id = ms.shop_customer_id
         JOIN customers c       ON c.customer_id = sc.customer_id
        WHERE sc.shop_id = ?
          AND ms.statement_month = DATE_FORMAT(COALESCE(?, CURDATE() - INTERVAL 1 MONTH), '%Y-%m-01')
        ORDER BY ms.closing_balance DESC`,
      [c.get('shop').shopId, month ?? null],
    );
    return c.json(rows);
  })

  // POST /generate - (re)build statements for a month. owner or manager.
  // note: the procedure does it for every shop at once, it's safe to run again
  .post(
    '/generate',
    requireShopAccess({ manager: true }),
    validate('json', monthQuery),
    async (c) => {
      const { month } = c.req.valid('json');
      await withConn(c.get('user').fullName, (conn) =>
        conn.query(
          "CALL sp_generate_statements(DATE_FORMAT(COALESCE(?, CURDATE() - INTERVAL 1 MONTH), '%Y-%m-01'))",
          [month ?? null],
        ),
      );
      return c.json({ ok: true });
    },
  );
