// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Customer ledger & statement',
  owner: 'Member 2',
  description:
    'The full khata page for one customer: every sale, payment and adjustment with a running balance.',
  endpoints: [
    'GET /api/shops/:shopId/ledger/:shopCustomerId',
    'GET /api/shops/:shopId/sales/:saleId',
  ],
  todo: [
    'Header: name, phone, trust ring, balance vs limit progress, actions (New sale, Record payment, Promise)',
    'Ledger table with running balance column (SUM() OVER)',
    'Expand a sale → items + which payments cleared it',
    'Print-friendly statement view',
  ],
  queries: ['Q7 running statement', 'Q6 FIFO trace'],
};

export default function CustomerLedgerPage() {
  return <PageStub spec={spec} />;
}
