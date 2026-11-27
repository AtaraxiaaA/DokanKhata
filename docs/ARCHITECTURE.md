# Architecture

```
Browser  (React 19 + TypeScript, Vite, Tailwind v4, shadcn/ui)       apps/web
   │  typed client: hc<AppType>  →  fetch('/api/...')  (cookie: dk_session)
   ▼
Vite dev proxy  /api → :3001
   ▼
API  (Node 22, Hono, zod)                                            apps/api
   │  requireAuth → requireRole / requireShopAccess → validate → handler
   │  mysql2 pool · raw SQL with ? · withConn() sets @app_user · CALL sp_*
   ▼
MariaDB 10.4 on XAMPP                                                 db/database
   tables · views · triggers · stored procedures · scheduled events
```

Shared contracts (enums, zod schemas, row types, money/date helpers) live in `packages/shared` and are imported by both sides.

## Why it is built this way

- **Rules live in the database.** Credit limits, stock, sale status, the append-only ledger and audit logging are enforced by triggers and procedures. The API can't bypass them, and neither can phpMyAdmin.
- **No ORM.** This is a database course and the SQL is what's graded. ORMs also handle `CALL` with OUT params, `SIGNAL` errors and triggers badly.
- **End-to-end types.** The web app imports the API's type (`AppType`). If someone renames a field in a route, the pages that use it stop compiling, instead of breaking during the demo.
- **One API, many pages.** The API and all the SQL are finished and tested, so the pages can be built in parallel without waiting on each other.

## Request lifecycle (example: record a credit sale)

1. `NewSalePage` calls `useCreateSale(shopId).mutateAsync({ shopCustomerId, items })`.
2. `POST /api/shops/1/sales` → `requireAuth` loads the session from `user_sessions` → `requireShopAccess({ canGiveCredit: true })` checks membership → zod validates the body.
3. The handler checks the account belongs to shop 1, then `withConn(user.fullName, conn => callProc(conn, 'sp_record_credit_sale', [...]))`.
4. The procedure locks the account row (`FOR UPDATE`), prices the items from `shop_products`, and inserts the sale. Trigger T1 checks blocked status and the credit limit; T4 checks and lowers stock. Then it commits.
5. If a rule fails, MariaDB `SIGNAL`s SQLSTATE 45000 → `errors.ts` maps it to **422** with the DB's own message → the page shows it in a toast.

## Error contract

Every non-2xx response has this shape:

```json
{ "error": { "code": "BUSINESS_RULE", "message": "Credit limit exceeded: owes Tk 1973.00, ..." } }
```

| Status | code | When |
|---|---|---|
| 400 | `VALIDATION` | zod rejected the input (`details` lists the fields) |
| 401 | `UNAUTHORIZED` / `BAD_CREDENTIALS` | Not logged in / wrong password |
| 403 | `FORBIDDEN` / `SUSPENDED` | Wrong role, not your shop, not allowed to give credit |
| 404 | `NOT_FOUND` | Record or endpoint missing |
| 409 | `DUPLICATE` | Unique key, e.g. the same bKash TrxID twice |
| 422 | `BUSINESS_RULE` / `CHECK_FAILED` | A database rule said no |

## Auth

- Login by phone or email; passwords are bcrypt (the seed uses PHP `$2y$` hashes, which work as-is).
- Session: a random 32-byte token in an `HttpOnly; SameSite=Lax` cookie. The DB stores only `sha256(token)` in `user_sessions`. Logout deletes the row.
- Roles: `owner`, `staff` (`manager`/`cashier` via `shop_staff`), `customer`, `admin`. Shop membership is checked on every `/shops/:shopId/*` request, and the procedures check it again.

## Database objects (23 tables, 6 views, 7 procedures, 13 triggers, 5 events)

See the README for the full list. Added in the skeleton:

- `user_sessions`: API login sessions
- `festivals`: Eid/Puja/Pohela Boishakh dates for the festival-spike report (Q9)

Shared bits of the API worth knowing: `lib/ownership.ts` (checks a record belongs to the shop in the URL), `lib/statement.ts` (Q7, used by the shop ledger and the portal), `withTx()` in `db.ts` (for requests that write to several tables).
