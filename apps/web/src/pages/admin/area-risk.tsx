// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Area risk',
  owner: 'Member 1',
  description: 'Where overdue credit is concentrated.',
  endpoints: ['GET /api/admin/reports/area-risk'],
  todo: [
    'Table + bar chart: overdue rate by area / thana / district',
    'Drill down division → district → thana',
  ],
  queries: ['Q14 area risk'],
};

export default function AreaRiskPage() {
  return <PageStub spec={spec} />;
}
