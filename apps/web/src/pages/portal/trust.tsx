// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'My trust score',
  owner: 'Member 4',
  description: 'Your score across all shops, and why.',
  endpoints: ['GET /api/portal/trust'],
  todo: [
    'Big TrustScoreRing + band label',
    'Breakdown of each component (on-time %, days late, broken promises, shops owed, write-offs)',
    'Perfect-payer badge',
    'Tips to improve',
  ],
  queries: ['Q5 trust score', 'Q17 perfect payers'],
};

export default function MyTrustPage() {
  return <PageStub spec={spec} />;
}
