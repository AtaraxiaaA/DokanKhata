# Contributing

## First-time setup (each member)

1. Install **Node.js 22 LTS** (or newer) and **XAMPP**. Start **MySQL** in the XAMPP Control Panel.
2. Clone and install:
   ```bash
   git clone https://github.com/AtaraxiaaA/DokanKhata.git
   cd DokanKhata
   npm install
   cp .env.example .env          # Windows: copy .env.example .env
   ```
   If your MySQL root user has a password, put it in `.env` as `DB_PASSWORD`.
3. Load the database: `npm run db:reset`, then `npm run db:check` (all ✓).
   - Windows: the script looks for `C:\xampp\mysql\bin\mysql.exe`. If yours is elsewhere, set `MYSQL_BIN` in `.env`.
4. Keep the nightly jobs on: add `event_scheduler=ON` under `[mysqld]` in `C:\xampp\mysql\bin\my.ini` (Windows) or `/Applications/XAMPP/xamppfiles/etc/my.cnf` (macOS), then restart MySQL.
5. `npm run dev` starts the API at <http://localhost:3001> and the web app at <http://localhost:5173>.
   On the login page (dev only) there are one-click demo accounts. All passwords are `dokan123`.

## Daily workflow

```bash
git checkout main && git pull
npm install                      # if package.json changed
npm run db:reset                 # if anything in db/ changed
git checkout -b feat/m3-add-customer
# ...work...
npm run typecheck && npm run lint
git commit -m "feat(customers): add customer form with phone lookup"
git push -u origin feat/m3-add-customer   # then open a PR to main
```

- **Branches:** `feat/m<member>-<feature>`, `fix/m<member>-<bug>`, `docs/...`, `db/...`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `db: ...`
- **PRs:** small (one page or endpoint), at least 1 review, CI-style checks run locally (`typecheck`, `lint`). Member 1 merges.
- **Never** push directly to `main`. Never commit `.env`.

## Changing the database

The schema is shared by everyone, so DB changes need extra care.

1. Edit `db/database/schema.sql` (or `seed.sql`). Follow the naming conventions at the top of `schema.sql`.
2. Run `npm run db:build` to regenerate `dokankhata_full.sql`, then `npm run db:reset`.
3. If you changed an ENUM, update `packages/shared/src/enums.ts` in the **same PR**.
4. Use a `db/...` branch and tell the team in the PR title: `db: add X`.

## Rules that keep the project safe

- SQL uses `?` placeholders. Never put user input into a SQL string. Lint blocks it; a fixed fragment you built yourself must be in a variable named `sqlXxx`.
- Business rules belong in the database (triggers and procedures). The API checks permissions and validates input; it doesn't re-implement limits or balances.
- Money arithmetic happens in SQL. The UI only formats it with `<Money>`.
- Every write goes through `withConn(user.fullName, ...)`, so `audit_log` records who did it.
- Ledger rows (`credit_sales`, `payments`) are never updated or deleted. Corrections go through `sp_add_adjustment`.
