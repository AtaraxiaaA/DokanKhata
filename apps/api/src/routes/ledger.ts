// customer ledger, mounted at /api/shops/:shopId/ledger
import { Hono } from 'hono';
import type { AppEnv } from '../lib/env-types';
import { accountInShop, paramId } from '../lib/ownership';
import { getStatement } from '../lib/statement';

export const ledgerRoutes = new Hono<AppEnv>()
  // GET /:shopCustomerId - every sale, payment and adjustment with a running balance (Q7)
  .get('/:shopCustomerId', async (c) => {
    const id = paramId(c, 'shopCustomerId');
    await accountInShop(id, c.get('shop').shopId);
    return c.json(await getStatement(id));
  });
