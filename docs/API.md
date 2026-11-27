# API contract

Base URL: `/api`. JSON in, JSON out. Errors use the shape in [ARCHITECTURE.md](ARCHITECTURE.md#error-contract).
✅ = built · ⬜ = stub returning 501 (owner shown). Source of truth: `apps/api/src/routes/*.ts`.

Use the typed client in the web app, never raw `fetch`:

```ts
const rows = await call(api.shops[':shopId'].customers.$get({ param: { shopId: '1' }, query: { owing: '1' } }));
```

## Public: `auth.ts`, `meta.ts` (Member 1)

| | Method & path | Body / query | Returns |
|---|---|---|---|
| ✅ | `POST /auth/login` | `{ identifier, password }` | `SessionUser` + sets cookie |
| ✅ | `POST /auth/logout` | | `{ ok }` |
| ✅ | `GET /auth/me` | | `SessionUser` or 401 |
| ⬜ | `POST /auth/register-shop` | owner + shop fields | `SessionUser` (shop `pending`) |
| ⬜ | `POST /auth/claim` | `{ phone, otp, password }` | `SessionUser` |
| ✅ | `GET /meta/health` | | DB name, event scheduler, server time |
| ✅ | `GET /meta/areas` | | areas for selects |
| ✅ | `GET /meta/categories` | | categories |

## Shop: every path starts `/shops/:shopId` (owner or staff of that shop)

### Customers: `customers.ts` (Member 3)
| | | | |
|---|---|---|---|
| ✅ | `GET /customers` | `?q&status&owing=1&limit&offset` | `{ rows: CustomerBalanceRow[], total }` |
| ✅ | `GET /customers/lookup` | `?phone=01XXXXXXXXX` | `CustomerLookup` (404 if unknown) |
| ⬜ | `POST /customers` | `{ phone, fullName, nid?, areaId?, creditLimit?, dueDays? }` | account |
| ⬜ | `GET /customers/:shopCustomerId` | | account detail + guarantors |
| ⬜ | `PATCH /customers/:shopCustomerId` | `{ creditLimit?, dueDays?, status?, blockedReason? }` (manager) | account |
| ⬜ | `POST /customers/:shopCustomerId/guarantors` | `{ guarantorCustomerId, guaranteeLimit }` | |

### Products: `products.ts` (Member 3)
| | | | |
|---|---|---|---|
| ✅ | `GET /products` | `?q` | `ShopProductRow[]` |
| ⬜ | `GET /products/catalog` | `?q` | catalog items not yet sold here |
| ⬜ | `POST /products` | `{ productId, sellPrice, stockQty, reorderLevel }` (manager) | |
| ⬜ | `PATCH /products/:shopProductId` | price / stock / reorder / active (manager) | |

### Sales, payments, ledger: `sales.ts`, `payments.ts`, `ledger.ts`, `adjustments.ts`, `disputes.ts`, `statements.ts` (Member 2)
| | | | |
|---|---|---|---|
| ✅ | `POST /sales` | `{ shopCustomerId, items: [{ shopProductId, qty }], note? }` | `{ saleId, totalAmount, dueDate, soldAt }` → `sp_record_credit_sale` |
| ⬜ | `GET /sales` | `?status&from&to&shopCustomerId` | sales list |
| ⬜ | `GET /sales/:saleId` | | sale + items + allocations + adjustments |
| ⬜ | `PATCH /sales/:saleId/due-date` | `{ dueDate }` (manager, extend only) | |
| ⬜ | `POST /payments` | `{ shopCustomerId, amount, method, trxRef? }` | payment + allocations → `sp_record_payment` |
| ⬜ | `GET /payments` | `?from&to&method&shopCustomerId` | |
| ⬜ | `GET /payments/preview` | `?shopCustomerId&amount` | FIFO preview (no write) |
| ⬜ | `GET /payments/:paymentId` | | allocations (Q6) |
| ⬜ | `GET /ledger/:shopCustomerId` | | running statement (Q7) |
| ⬜ | `GET /adjustments` · `POST /adjustments` | `{ saleId, type, amount, reason }` (manager) | → `sp_add_adjustment` |
| ⬜ | `GET /disputes` · `PATCH /disputes/:disputeId` | `{ status, resolution }` (manager) | |
| ⬜ | `GET /statements` · `POST /statements/generate` | `?month=YYYY-MM-01` | → `sp_generate_statements` |

### Follow-up, staff, settings: `promises.ts`, `reminders.ts`, `staff.ts`, `settings.ts` (Member 3)
| | | | |
|---|---|---|---|
| ⬜ | `GET /promises` · `POST /promises` | `{ shopCustomerId, promisedAmount, promisedDate }` | |
| ⬜ | `GET /promises/repeat-breakers` | | Q11 |
| ⬜ | `GET /reminders` · `PATCH /reminders/:reminderId` | `{ status }` | |
| ⬜ | `GET /staff` · `POST /staff` · `PATCH /staff/:userId` | (manager) | |
| ⬜ | `GET /settings` · `PATCH /settings` | (manager for PATCH) | |
| ⬜ | `GET /settings/dashboard` | | KPIs, Q2, Q4, Q16 |

### Reports: `reports.ts` (Member 4)
| | | |
|---|---|---|
| ⬜ | `GET /reports/aging` | Q1 |
| ⬜ | `GET /reports/trend` | Q8 |
| ⬜ | `GET /reports/festival` | Q9 |
| ⬜ | `GET /reports/top-debtors` | Q10 |
| ⬜ | `GET /reports/staff` | Q13 (manager) |
| ⬜ | `GET /reports/products` | Q15 |

## Customer portal: `/portal/*`, role `customer` (Member 4), `portal.ts`
| | | |
|---|---|---|
| ⬜ | `GET /portal/balances` | my accounts at every shop |
| ⬜ | `GET /portal/statement/:shopCustomerId` | must be MY account (check `customer_id = user.customerId`) |
| ⬜ | `GET /portal/trust` | Q5, Q17 |
| ⬜ | `POST /portal/disputes` | `{ saleId, reason }` (my sale only) |
| ⬜ | `POST /portal/pay` | prototype: `{ shopCustomerId, amount, method }`; server makes a fake TrxID and calls `sp_record_payment` with `received_by` = shop owner |

## Admin: `/admin/*`, role `admin` (Member 1), `admin.ts`
| | | |
|---|---|---|
| ⬜ | `GET /admin/overview` | platform KPIs |
| ⬜ | `GET /admin/shops?status=pending` · `PATCH /admin/shops/:shopId/verify` | |
| ⬜ | `GET /admin/users` · `PATCH /admin/users/:userId` | suspend also deletes their sessions |
| ⬜ | `GET /admin/audit-log` | |
| ⬜ | `GET /admin/reports/area-risk` | Q14 |
| ⬜ | `GET /admin/reports/exposure` | Q3 |
