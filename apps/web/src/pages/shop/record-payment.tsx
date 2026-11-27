// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Record payment',
  owner: 'Member 2',
  description:
    'Take cash or bKash/Nagad/Rocket. The database applies it to the oldest sales first.',
  endpoints: [
    'GET /api/shops/:shopId/customers/lookup',
    'GET /api/shops/:shopId/payments/preview',
    'POST /api/shops/:shopId/payments',
  ],
  todo: [
    'Same phone lookup + risk card as New Credit Sale (reuse the component)',
    'Amount + method; TrxID required for mobile methods',
    'Live FIFO preview: which sales this amount clears',
    'Success receipt with allocations; DB errors (overpay, duplicate TrxID) as toasts',
  ],
  queries: ['Q6 FIFO trace'],
};

export default function RecordPaymentPage() {
  return <PageStub spec={spec} />;
}
