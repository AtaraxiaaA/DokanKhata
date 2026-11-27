// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Customers',
  owner: 'Member 3',
  description: 'Every customer account at this shop with their balance and trust score.',
  endpoints: ['GET /api/shops/:shopId/customers  (already built)'],
  todo: [
    'DataTable: name, phone, balance (Money tone=auto), limit, available, trust ring, status badge',
    'Search box (debounced) + filters: owing only, blocked',
    'Row click → customer ledger',
    '"Add customer" button',
  ],
};

export default function CustomersPage() {
  return <PageStub spec={spec} />;
}
