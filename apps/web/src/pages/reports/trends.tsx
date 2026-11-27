// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Collection trends',
  owner: 'Member 4',
  description: 'Credit given vs. collected per month, with change from last month.',
  endpoints: ['GET /api/shops/:shopId/reports/trend', 'GET /api/shops/:shopId/reports/festival'],
  todo: [
    'Line/area chart: credit vs collected (Recharts)',
    'Month-over-month % change (LAG)',
    'Festival callout: credit spike before Eid / Puja',
  ],
  queries: ['Q8 monthly trend', 'Q9 festival spike'],
};

export default function TrendsReportPage() {
  return <PageStub spec={spec} />;
}
