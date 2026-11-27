// Q7: one account's ledger with a running balance.
// used by the shop ledger page and by the customer portal statement.
import { query, queryOne } from '../db';

export interface StatementLine {
  happenedAt: string;
  kind: 'sale' | 'payment' | 'adjustment';
  refId: number;
  saleId: number | null;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  saleStatus: string | null;
}

export async function getStatement(shopCustomerId: number) {
  // sales add to the balance, payments and adjustments take it down.
  // sort_key keeps a sale before a payment made in the same second.
  const lines = await query<StatementLine>(
    `SELECT t.happened_at, t.kind, t.ref_id, t.sale_id, t.description, t.debit, t.credit, t.sale_status,
            SUM(t.debit - t.credit) OVER (ORDER BY t.happened_at, t.sort_key, t.ref_id) AS running_balance
       FROM (
         SELECT cs.sold_at AS happened_at, 'sale' AS kind, cs.sale_id AS ref_id, cs.sale_id, 1 AS sort_key,
                CONCAT('Credit sale #', cs.sale_id, IFNULL(CONCAT(' · ', cs.note), '')) AS description,
                cs.total_amount AS debit, 0 AS credit, cs.status AS sale_status
           FROM credit_sales cs
          WHERE cs.shop_customer_id = ?
         UNION ALL
         SELECT p.paid_at, 'payment', p.payment_id, NULL, 2,
                CONCAT('Payment by ', p.method, IFNULL(CONCAT(' · ', p.trx_ref), '')),
                0, p.amount, NULL
           FROM payments p
          WHERE p.shop_customer_id = ?
         UNION ALL
         SELECT a.created_at, 'adjustment', a.adjustment_id, a.sale_id, 3,
                CONCAT(REPLACE(a.adj_type, '_', ' '), ' on sale #', a.sale_id, ' · ', a.reason),
                0, a.amount, NULL
           FROM adjustments a
           JOIN credit_sales cs ON cs.sale_id = a.sale_id
          WHERE cs.shop_customer_id = ?
       ) AS t
      ORDER BY t.happened_at, t.sort_key, t.ref_id`,
    [shopCustomerId, shopCustomerId, shopCustomerId],
  );

  const account = await queryOne<{
    shopCustomerId: number;
    shopId: number;
    shopName: string;
    customerId: number;
    fullName: string;
    phone: string;
    creditLimit: number;
    status: string;
    balance: number;
    availableCredit: number;
    totalCredit: number;
    totalPaid: number;
    totalAdjusted: number;
    maxDaysOverdue: number;
    oldestUnpaidDue: string | null;
    trustScore: number | null;
  }>(
    `SELECT b.shop_customer_id, b.shop_id, b.shop_name, b.customer_id, b.full_name, b.phone,
            b.credit_limit, b.status, b.balance, b.available_credit, b.total_credit, b.total_paid,
            b.total_adjusted, b.max_days_overdue, b.oldest_unpaid_due, t.score AS trust_score
       FROM v_customer_balance b
       LEFT JOIN customer_trust_scores t ON t.customer_id = b.customer_id
      WHERE b.shop_customer_id = ?`,
    [shopCustomerId],
  );

  return { account, lines };
}
