// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Top debtors',
  owner: 'Member 4',
  description: 'The 10 biggest debtors and how long they have owed.',
  endpoints: ['GET /api/shops/:shopId/reports/top-debtors'],
  todo: ['Ranked list with RANK(), balance, days overdue, trust ring', 'Link to each ledger'],
  queries: ['Q10 top debtors'],
};

export default function TopDebtorsPage() {
  return <PageStub spec={spec} />;
}
