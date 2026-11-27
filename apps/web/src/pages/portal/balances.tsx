// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'My balances',
  owner: 'Member 4',
  description: 'What you owe at every shop, in one place.',
  endpoints: ['GET /api/portal/balances'],
  todo: [
    'Total owed hero number + per-shop cards (shop, balance, next due date, status)',
    'Tap a shop → statement',
    'Mobile-first',
  ],
};

export default function MyBalancesPage() {
  return <PageStub spec={spec} />;
}
