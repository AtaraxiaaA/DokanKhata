// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Sales history',
  owner: 'Member 2',
  description: 'Every credit sale at this shop.',
  endpoints: ['GET /api/shops/:shopId/sales'],
  todo: [
    'DataTable: date, customer, staff, total, paid, balance, due date, status badge',
    'Filters: status, date range, staff',
    'Row click → sale detail drawer (items, allocations, adjustments)',
  ],
};

export default function SalesHistoryPage() {
  return <PageStub spec={spec} />;
}
