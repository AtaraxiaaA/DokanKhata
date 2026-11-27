// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Dashboard',
  owner: 'Member 3',
  description: 'Today at a glance: money out on baki, what is overdue, what came in.',
  endpoints: ['GET /api/shops/:shopId/settings/dashboard'],
  todo: [
    'StatCards: outstanding, overdue, collected this month, customers owing, DSO',
    'Mini aging bar + list of over-limit and "vanished" customers',
    'Quick actions: New sale, Record payment, Add customer',
    'Low-stock products (stock_qty <= reorder_level)',
  ],
  queries: ['Q2 over-limit', 'Q4 vanished debtors', 'Q16 days sales outstanding'],
};

export default function ShopDashboardPage() {
  return <PageStub spec={spec} />;
}
