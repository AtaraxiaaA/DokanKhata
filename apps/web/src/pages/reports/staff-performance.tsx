// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Staff performance',
  owner: 'Member 4',
  description: 'Credit given vs. collected per staff member, and red flags.',
  endpoints: ['GET /api/shops/:shopId/reports/staff'],
  todo: [
    'Table: staff, credit given, collected, disputes, credit to blocked customers',
    'Red-flag badge on outliers',
    'Manager only',
  ],
  queries: ['Q13 staff red flags'],
};

export default function StaffPerformancePage() {
  return <PageStub spec={spec} />;
}
