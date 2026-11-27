// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Credit by product',
  owner: 'Member 4',
  description: 'What people buy on baki.',
  endpoints: ['GET /api/shops/:shopId/reports/products'],
  todo: ['Bar chart by category, table by product (qty, amount, customers)', 'Date range filter'],
  queries: ['Q15 credit products'],
};

export default function CreditByProductPage() {
  return <PageStub spec={spec} />;
}
