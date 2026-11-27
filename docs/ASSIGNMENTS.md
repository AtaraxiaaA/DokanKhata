# Feature assignments

**Update:** the whole API and all 17 queries are done and tested (`npm run test:api`). So your job now is the **pages**: replace each stub page you own with the real one, using the endpoints in [API.md](API.md).

Each stub page already says what it needs and which endpoints to use. If a page needs something the API doesn't give you, tell Member 1 rather than writing SQL in a new place, so the queries stay in one file.

| Member | Module | Pages | Queries the pages show |
|---|---|---|---|
| **1 (lead)** | Platform, auth, admin, the whole API, all 17 queries, reviews | Landing ✅, Login ✅, Shop Registration ✅, Customer Account Claim ✅, Admin Dashboard ✅, Shop Verification ✅, User Management ✅, Audit Log ✅, Area Risk ✅ | all ✅ |
| **2** | Credit ledger (the hardest writes) | New Credit Sale (built as the reference; finish & polish), Record Payment, Customer Ledger & Statement, Sales History, Payment History, Adjustments & Write-offs, Disputes, Monthly Statements | Q6, Q7 |
| **3** | Shop operations, customers, catalog | Shop Dashboard, Customer List, Add/Edit Customer (+guarantor), Product Catalog, Price List & Stock, Staff Management, Shop Settings, Promises, Reminder Queue | Q2, Q4, Q11, Q12, Q16 |
| **4** | Reports, customer portal, payment prototype | Aging, Collection Trends, Top Debtors, Staff Performance, Credit by Product, My Balances, My Statement, Pay Due (bKash/Nagad mock), Raise Dispute, My Trust Score | Q1 ✅, Q5, Q8, Q9, Q10, Q13, Q15, Q17 |

## Where your files are

All endpoints are in `apps/api/src/routes/` (built). Your work is in `apps/web/src/`:

| Member | Pages (`pages/`) | Query hooks to add (`api/queries/`) |
|---|---|---|
| 2 | `shop/new-sale.tsx` (polish), `shop/record-payment.tsx`, `shop/customer-ledger.tsx`, `shop/sales-history.tsx`, `shop/payment-history.tsx`, `shop/adjustments.tsx`, `shop/disputes.tsx`, `reports/statements.tsx` | `sales.ts` (extend), `payments.ts`, `ledger.ts`, `adjustments.ts`, `disputes.ts`, `statements.ts` |
| 3 | `shop/dashboard.tsx`, `shop/customers.tsx`, `shop/customer-form.tsx`, `shop/promises.tsx`, `shop/reminders.tsx`, `shop/staff.tsx`, `shop/settings.tsx`, `catalog/products.tsx`, `catalog/stock.tsx` | `customers.ts` (extend), `products.ts` (extend), `promises.ts`, `reminders.ts`, `staff.ts`, `settings.ts` |
| 4 | `reports/aging.tsx`, `reports/trends.tsx`, `reports/top-debtors.tsx`, `reports/staff-performance.tsx`, `reports/credit-by-product.tsx`, `portal/*` | `reports.ts`, `portal.ts` |

Good pages to copy from: `shop/new-sale.tsx` (lookup + cart + mutation), `admin/users.tsx` (filters + table + paging), `admin/area-risk.tsx` (a chart + table), `public/register.tsx` (a form with zod).

## Suggested order

1. **Member 3:** Add customer, then the customer list. Everyone needs test customers.
2. **Member 2:** Record payment, then Customer ledger. The portal statement looks the same.
3. **Member 4:** My balances and Aging first (both simple), then the chart pages.

## Definition of done (per page)

- [ ] Uses the typed client through a hook in `api/queries/`, no raw `fetch`
- [ ] Shows the server's error message when something is refused
- [ ] Page uses shared components (`DataTable`, `Money`, `PageHeader`, `StatCard`, badges)
- [ ] Loading (skeleton), empty and error states
- [ ] Works at 390px wide and in dark mode
- [ ] `npm run typecheck && npm run lint` clean
- [ ] PR reviewed by one other member
