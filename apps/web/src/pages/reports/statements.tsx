// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Monthly statements',
  owner: 'Member 2',
  description: 'Frozen month-end statements per customer.',
  endpoints: ['GET /api/shops/:shopId/statements', 'POST /api/shops/:shopId/statements/generate'],
  todo: [
    'Month picker; table: opening, credit, paid, adjustments, closing',
    'Generate / regenerate for a month (manager)',
    'Printable statement',
  ],
};

export default function StatementsPage() {
  return <PageStub spec={spec} />;
}
