// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Payment history',
  owner: 'Member 2',
  description: 'Every payment received, with method and TrxID.',
  endpoints: ['GET /api/shops/:shopId/payments', 'GET /api/shops/:shopId/payments/:paymentId'],
  todo: [
    'DataTable: date, customer, amount, method badge, TrxID, received by',
    'Filters: method, date range',
    'Row click → which sales it cleared (FIFO trace)',
  ],
  queries: ['Q6 FIFO trace'],
};

export default function PaymentHistoryPage() {
  return <PageStub spec={spec} />;
}
