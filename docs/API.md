# API reference

Every endpoint is built and tested (`npm run test:api` checks all of them as every role).
Base URL is `/api`. Request and response bodies are JSON. Errors always look like this:

```json
{ "error": { "code": "BUSINESS_RULE", "message": "Credit limit exceeded: owes Tk 1973.00, ..." } }
```

| Status | When |
|---|---|
| 400 `VALIDATION` | bad input (`details` says which field) |
| 401 | not logged in |
| 403 | wrong role, not your shop, no credit permission, or the shop isn't verified yet |
| 404 | not found, or it belongs to another shop/customer |
| 409 `DUPLICATE` | same phone, same TrxID, product already listed, second open dispute… |
| 422 `BUSINESS_RULE` | the database said no (limit, stock, blocked, overpaying…). Show the message as it is. |

## How to call it from a page

Don't use `fetch`. Use the typed client, so your page stops compiling if an endpoint changes:

```ts
import { api, call } from '@/api/client';

const rows = await call(api.shops[':shopId'].customers.$get({ param: { shopId: '1' }, query: { owing: '1' } }));
await call(api.shops[':shopId'].payments.$post({ param: { shopId: '1' }, json: { shopCustomerId: 5, amount: 500, method: 'cash' } }));
```

- Query values are always strings (`limit: '20'`).
- Wrap calls in react-query hooks in `apps/web/src/api/queries/<module>.ts`. `customers.ts`, `sales.ts` and `admin.ts` are there to copy.
- Field names are camelCase versions of the SQL columns. Money is a number, dates are strings (`'2026-11-27'` / `'2026-11-27 14:05:00'`); format them with `<Money>` and `formatDate()`.
- Body shapes (zod schemas) are in `packages/shared/src/schemas/`, so you can reuse them in forms with `zodResolver`.

Who can call what: `S` = owner or any staff of that shop, `M` = owner or manager only, `C` = owner or staff with "can give credit", `A` = shop must be active (verified).

---

## Public

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ identifier, password }` (phone or email) | `SessionUser`, sets the cookie |
| POST | `/auth/logout` | | `{ ok }` |
| GET | `/auth/me` | | `SessionUser` or 401 |
| POST | `/auth/register-shop` | `{ owner: { fullName, phone, email?, password }, shop: { name, shopType, tradeLicenceNo?, areaId, address, phone? } }` | `SessionUser` (shop is `pending`), logged in |
| POST | `/auth/claim/start` | `{ phone }` | `{ firstName, shops[], demoCode }`. 404 if no shop has them, 409 if already claimed |
| POST | `/auth/claim` | `{ phone, otp, password }` | `SessionUser` (customer), logged in. The demo OTP is `123456` |
| GET | `/meta/health` | | DB name, event scheduler on/off |
| GET | `/meta/areas` | | areas for dropdowns |
| GET | `/meta/categories` | | product categories |

## Shop: every path starts with `/shops/:shopId`

### Customers (`customers.ts`)
| | Method | Path | Body / query | Returns |
|---|---|---|---|---|
| S | GET | `/customers` | `?q&status&owing=1&limit&offset` | `{ rows: CustomerBalanceRow[], total }` |
| S | GET | `/customers/lookup` | `?phone=` | `CustomerLookup`: account here, trust, debt at other shops (404 if unknown) |
| S | GET | `/customers/guarantor-risk` | | **Q12** guarantors whose accounts are overdue |
| S | POST | `/customers` | `{ phone, fullName, nid?, areaId?, address?, creditLimit?, dueDays? }` | `{ shopCustomerId, customerId, existingPerson }`. Reuses the person if the phone is already on DokanKhata |
| S | GET | `/customers/:shopCustomerId` | | `{ account, guarantors, guarantees, promises }` |
| M | PATCH | `/customers/:shopCustomerId` | `{ creditLimit?, dueDays?, status?, blockedReason? }` | `{ ok }`. Logged in the audit log |
| M | POST | `/customers/:shopCustomerId/guarantors` | `{ guarantorCustomerId, guaranteeLimit }` | `{ ok }` |

### Products (`products.ts`)
| | Method | Path | Body / query | Returns |
|---|---|---|---|---|
| S | GET | `/products` | `?q` | active `ShopProductRow[]` (for the sale cart) |
| S | GET | `/products/all` | | every item incl. inactive, with `lowStock` |
| S | GET | `/products/catalog` | `?q&categoryId` | catalog products this shop doesn't sell yet |
| M | POST | `/products` | `{ productId, sellPrice, stockQty?, reorderLevel?, trackStock? }` | `{ shopProductId }` |
| M | PATCH | `/products/:shopProductId` | `{ sellPrice?, stockQty?, reorderLevel?, trackStock?, isActive? }` | `{ ok }` |

### Sales (`sales.ts`)
| | Method | Path | Body / query | Returns |
|---|---|---|---|---|
| C A | POST | `/sales` | `{ shopCustomerId, items: [{ shopProductId, qty }], note? }` | `{ saleId, totalAmount, dueDate, soldAt }` |
| S | GET | `/sales` | `?status&shopCustomerId&staffUserId&unpaid=1&from&to&limit&offset` | `{ rows, total, sumTotal, sumOutstanding }` |
| S | GET | `/sales/:saleId` | | `{ sale, items, allocations, adjustments, disputes }` |
| M | PATCH | `/sales/:saleId/due-date` | `{ dueDate }` (later only) | `{ ok }` |

### Payments (`payments.ts`)
| | Method | Path | Body / query | Returns |
|---|---|---|---|---|
| S A | POST | `/payments` | `{ shopCustomerId, amount, method, trxRef? }` (TrxID needed for bkash/nagad/rocket) | `{ payment, allocations }` |
| S | GET | `/payments/preview` | `?shopCustomerId&amount` | `{ payable, tooMuch, allocations }`. Which sales it would clear, nothing saved |
| S | GET | `/payments` | `?method&shopCustomerId&from&to&limit&offset` | `{ rows, total, sumAmount }` |
| S | GET | `/payments/:paymentId` | | `{ payment, allocations }` (**Q6**) |

### Ledger, adjustments, disputes, statements
| | Method | Path | Body / query | Returns |
|---|---|---|---|---|
| S | GET | `/ledger/:shopCustomerId` | | `{ account, lines }` with `runningBalance` (**Q7**) |
| S | GET | `/adjustments` | `?type&from&to&limit&offset` | `{ rows, total, sumAmount }` |
| M | POST | `/adjustments` | `{ saleId, type, amount, reason }` | `{ adjustmentId }` |
| S | GET | `/disputes` | `?status` | disputes, open first |
| S | POST | `/disputes` | `{ saleId, reason }` (recorded at the counter) | `{ disputeId }` |
| M | PATCH | `/disputes/:disputeId` | `{ status: accepted\|rejected, resolution }` | `{ ok, saleId }` |
| S | GET | `/statements/months` | | months that have statements |
| S | GET | `/statements` | `?month=YYYY-MM-01` (default last month) | statement rows |
| M | POST | `/statements/generate` | `{ month? }` | `{ ok }` |

### Follow-up, staff, settings
| | Method | Path | Body / query | Returns |
|---|---|---|---|---|
| S | GET | `/promises` | `?status` | promises, pending first |
| S | POST | `/promises` | `{ shopCustomerId, promisedAmount, promisedDate }` | `{ promiseId }` |
| S | GET | `/promises/repeat-breakers` | | **Q11** |
| S | GET | `/reminders` | `?status&type&date` | reminder queue |
| S | PATCH | `/reminders/:reminderId` | `{ status: sent\|failed\|cancelled }` | `{ ok }` |
| S | POST | `/reminders/mark-all-sent` | | `{ updated }` |
| S | GET | `/staff` | | staff, current first |
| M | POST | `/staff` | `{ phone, fullName, password?, staffRole?, canGiveCredit? }` (password only for a new login) | `{ userId }` |
| M | PATCH | `/staff/:userId` | `{ staffRole?, canGiveCredit?, left? }` | `{ ok }` |
| S | GET | `/settings` | | shop profile |
| M | PATCH | `/settings` | `{ name?, shopType?, tradeLicenceNo?, areaId?, address?, phone?, defaultCreditLimit?, defaultDueDays? }` | `{ ok }` |
| S | GET | `/settings/dashboard` | | `{ kpis, aging, overLimit (Q2), vanished (Q4), dso (Q16), lowStock, dueSoon }` |

### Reports (`reports.ts`)
| | Method | Path | Query | Returns |
|---|---|---|---|---|
| S | GET | `/reports/aging` | | `{ totals, rows }` (**Q1**) |
| S | GET | `/reports/trend` | `?months=6` | per month: credit, collected, % change (**Q8**) |
| S | GET | `/reports/festival` | | credit before each festival vs normal (**Q9**) |
| S | GET | `/reports/top-debtors` | `?limit=10` | ranked (**Q10**) |
| M | GET | `/reports/staff` | `?from&to` | per staff + `redFlag` (**Q13**) |
| S | GET | `/reports/products` | `?from&to&limit` | `{ products, categories }` (**Q15**) |

## Customer portal: `/portal/*`, customer logins only

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/portal/balances` | | `{ totalOwed, shopsOwed, accounts[] }` |
| GET | `/portal/statement/:shopCustomerId` | | `{ account, lines }` (same as the ledger, own accounts only) |
| GET | `/portal/trust` | | `{ score, byShop (Q5), perfectPayer (Q17), firstSale }` |
| GET | `/portal/sales/:shopCustomerId` | | recent sales with `hasOpenDispute` (for the dispute form) |
| POST | `/portal/disputes` | `{ saleId, reason }` | `{ disputeId }` |
| POST | `/portal/pay` | `{ shopCustomerId, amount, method: bkash\|nagad\|rocket }` | `{ paymentId, trxRef, allocations }`. **Prototype**: no real gateway, it makes up a TrxID |

## Admin: `/admin/*`, admin logins only

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/admin/overview` | | `{ counts, money, recentShops, shopsByStatus }` |
| GET | `/admin/shops` | `?status&q` | shops with owner, area, customers, money owed |
| PATCH | `/admin/shops/:shopId/verify` | `{ action: approve\|suspend\|reactivate }` | `{ ok, status }` |
| GET | `/admin/users` | `?role&status&q&limit&offset` | `{ rows, total }` |
| PATCH | `/admin/users/:userId` | `{ status: active\|suspended }` | `{ ok }`. Suspending logs them out everywhere |
| GET | `/admin/audit-log` | `?table&from&to&limit&offset` | `{ rows, total }` with old/new values parsed |
| GET | `/admin/reports/area-risk` | `?level=area\|thana\|district` | **Q14** |
| GET | `/admin/reports/exposure` | `?minShops=3` | **Q3** |
