// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Raise a dispute',
  owner: 'Member 4',
  description: 'Tell the shop a sale is wrong.',
  endpoints: ['GET /api/portal/statement/:shopCustomerId', 'POST /api/portal/disputes'],
  todo: [
    'Pick sale (prefilled from statement) + reason',
    'Only one open dispute per sale (DB unique key) → show friendly error',
  ],
};

export default function RaiseDisputePage() {
  return <PageStub spec={spec} />;
}
