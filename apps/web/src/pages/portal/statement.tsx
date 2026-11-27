// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'My statement',
  owner: 'Member 4',
  description: 'Your khata page at one shop, with a running balance.',
  endpoints: ['GET /api/portal/balances', 'GET /api/portal/statement/:shopCustomerId'],
  todo: [
    'Shop picker when no shop is selected',
    'Running-balance ledger (same query as Q7)',
    '"Dispute this sale" action on each sale',
  ],
  queries: ['Q7 running statement'],
};

export default function MyStatementPage() {
  return <PageStub spec={spec} />;
}
