// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Disputes',
  owner: 'Member 2',
  description: 'Customers contesting a sale. While open, the sale is skipped by payments.',
  endpoints: ['GET /api/shops/:shopId/disputes', 'PATCH /api/shops/:shopId/disputes/:disputeId'],
  todo: [
    'List open first, with sale details and customer reason',
    'Resolve: accept (then usually add an adjustment) or reject, with a resolution note',
    'Manager only for resolving',
  ],
};

export default function DisputesPage() {
  return <PageStub spec={spec} />;
}
