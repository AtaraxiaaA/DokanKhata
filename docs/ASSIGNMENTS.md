# Feature assignments

Everyone owns **vertical slices**: for each feature you write the SQL query, the API route **and** the page. Nobody waits for anyone else's API.

The skeleton already contains, for every page, a stub file naming its owner and a route file whose endpoints return `501 Not built yet — owner: Member N`. Your job is to replace those stubs.

| Member | Module | Pages | Queries (`db/database/queries.sql`) |
|---|---|---|---|
| **1 (lead)** | Platform, auth, admin, integration, code review | Landing ✅, Login ✅, Shop Registration, Customer Account Claim, Admin Dashboard, Shop Verification, User Management, Audit Log, Area Risk | Q3, Q14 |
| **2** | Credit ledger (the hardest writes) | New Credit Sale (built as the reference; finish & polish), Record Payment, Customer Ledger & Statement, Sales History, Payment History, Adjustments & Write-offs, Disputes, Monthly Statements | Q6, Q7 |
| **3** | Shop operations, customers, catalog | Shop Dashboard, Customer List, Add/Edit Customer (+guarantor), Product Catalog, Price List & Stock, Staff Management, Shop Settings, Promises, Reminder Queue | Q2, Q4, Q11, Q12, Q16 |
| **4** | Reports, customer portal, payment prototype | Aging, Collection Trends, Top Debtors, Staff Performance, Credit by Product, My Balances, My Statement, Pay Due (bKash/Nagad mock), Raise Dispute, My Trust Score | Q1 ✅, Q5, Q8, Q9, Q10, Q13, Q15, Q17 |

## Where your files are

| Member | API route files (`apps/api/src/routes/`) | Page files (`apps/web/src/pages/`) |
|---|---|---|
| 1 | `auth.ts` (register-shop, claim), `admin.ts`, `meta.ts` | `public/*`, `admin/*` |
| 2 | `sales.ts`, `payments.ts`, `ledger.ts`, `adjustments.ts`, `disputes.ts`, `statements.ts` | `shop/new-sale.tsx`, `shop/record-payment.tsx`, `shop/customer-ledger.tsx`, `shop/sales-history.tsx`, `shop/payment-history.tsx`, `shop/adjustments.tsx`, `shop/disputes.tsx`, `reports/statements.tsx` |
| 3 | `customers.ts` (create/edit/guarantors), `products.ts` (catalog/edit), `staff.ts`, `settings.ts`, `promises.ts`, `reminders.ts` | `shop/dashboard.tsx`, `shop/customers.tsx`, `shop/customer-form.tsx`, `shop/promises.tsx`, `shop/reminders.tsx`, `shop/staff.tsx`, `shop/settings.tsx`, `catalog/*` |
| 4 | `reports.ts`, `portal.ts` | `reports/aging.tsx`, `reports/trends.tsx`, `reports/top-debtors.tsx`, `reports/staff-performance.tsx`, `reports/credit-by-product.tsx`, `portal/*` |

Query hooks go in `apps/web/src/api/queries/<module>.ts` (copy `customers.ts`).

## Suggested order (do the ones others depend on first)

1. **Member 3:** `POST customers` (Add customer). Everyone needs to create test customers.
2. **Member 2:** Record Payment, then Customer Ledger (Q7). Portal statement reuses Q7.
3. **Member 4:** Aging (Q1 is already written), then My Balances.
4. **Member 1:** Shop Registration + Shop Verification (the end-to-end "new shop" demo).

## Definition of done (per page)

- [ ] SQL written in `queries.sql` (if it's a report) with an EXPECT note
- [ ] API route validated with zod, guarded, `?` placeholders only, writes through `withConn`
- [ ] Page uses shared components (`DataTable`, `Money`, `PageHeader`, `StatCard`, badges)
- [ ] Loading (skeleton), empty and error states
- [ ] Works at 390px wide and in dark mode
- [ ] `npm run typecheck && npm run lint` clean
- [ ] PR reviewed by one other member
