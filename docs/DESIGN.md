# Design system

The goal is a product that looks like a funded startup's, not a lab assignment. Consistency matters more than individual brilliance, so **use the shared pieces**.

## Foundations

| | |
|---|---|
| **Brand** | Khata green (`primary`) for trust and money; turmeric amber (`brand-amber`) for warmth and attention. Warm paper background. |
| **Type** | Inter (UI) + Hind Siliguri (Bangla, automatic fallback). Use `font-bangla` on Bangla-only text. |
| **Numbers** | Every amount uses `<Money>` (৳, lakh grouping `1,00,000`, tabular digits). Other numeric columns use the `tabular` class. |
| **Radius** | Cards `rounded-xl`, pills `rounded-full`, inputs/buttons default. |
| **Spacing** | Page padding comes from the layout. Sections `space-y-6`, cards `p-5`/`p-6`, grids `gap-4`/`gap-6`. |
| **Colour** | Only tokens: `bg-primary`, `text-muted-foreground`, `bg-success/10`, `text-destructive` … **No hex codes and no `text-green-600`.** Tokens are in `apps/web/src/index.css`. |
| **Dark mode** | Free if you use tokens. Check every page in both themes. |

## Semantic colours

| Meaning | Token | Used for |
|---|---|---|
| Good / paid | `success` | Paid sales, reliable trust score, kept promises |
| Attention | `warning` | Partially paid, risky score, near limit |
| Bad / owed | `destructive` | Overdue, blocked, over limit, high risk |
| Neutral info | `info` | Open sales, fair score |

## Components: use these, don't rebuild them

| Need | Component (`@/components/app/...`) |
|---|---|
| Page title + actions | `PageHeader` |
| Any list | `DataTable` (sorting, skeleton, empty state built in) |
| KPI tile | `StatCard` |
| Amount | `Money` (`tone="auto"` makes debts red) |
| Sale / account status | `SaleStatusBadge`, `AccountStatusBadge`, `Pill` |
| Trust score | `TrustScoreRing` + `trustBand()` |
| Customer check before credit/payment | `CustomerRiskCard` |
| Empty / error / loading | `EmptyState`, `ErrorState`, `Skeleton` |
| Irreversible action | `ConfirmDialog` |
| Primitives | shadcn/ui in `@/components/ui` (Button, Card, Dialog, Select, Tabs, Sheet …). Add more with `npx shadcn@latest add <name>` from `apps/web`. |
| Charts | Recharts with `var(--chart-1..5)` colours |
| Toasts | `toast.success(...)` / `toast.error(title, { description })` from `sonner` |

## House rules

- **Plain backgrounds.** No grid-paper patterns, gradient blobs or glow effects behind content. Use `bg-background`, `bg-muted/40` for bands, and `bg-primary` for an emphasis section.
- **No course or dev details in the UI** (course codes, "TODO", etc.). The only exception is the dev-only stub banner and demo-login box, which disappear once a page is built or the app is built for production.

## Page checklist

- One `PageHeader` with a clear verb-first primary action.
- Loading shows skeletons in the page's real shape, not a spinner in the middle.
- Empty state explains what goes here and offers the next action.
- Errors show the server's message (DB rules give good messages already, so show them).
- Works at **390px** (phone) and **1440px**. Tables can scroll horizontally on phones; the page never does.
- Forms: label above input, inline error under the field, the submit button disables while saving.
- Use sentence case for text ("Record payment", not "Record Payment").
- Bangla product names are shown next to English when we have them.

## Reference screens

Copy from these before inventing anything: **Landing** (`pages/public/landing.tsx`), **Login** (`pages/public/login.tsx`), and **New credit sale** (`pages/shop/new-sale.tsx`).
