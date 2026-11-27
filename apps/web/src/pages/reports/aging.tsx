// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Aging report',
  owner: 'Member 4',
  description: 'How much is owed, and for how long.',
  endpoints: ['GET /api/shops/:shopId/reports/aging'],
  todo: [
    'Stacked bar: not due / 1–30 / 31–60 / 61–90 / 90+',
    'Customer table per bucket',
    'Export CSV',
  ],
  queries: ['Q1 aging'],
};

export default function AgingReportPage() {
  return <PageStub spec={spec} />;
}
