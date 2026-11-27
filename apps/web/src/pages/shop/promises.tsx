// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Promises',
  owner: 'Member 3',
  description:
    '"I\'ll pay ৳2,000 on the 5th." Track them; the nightly event marks them kept or broken.',
  endpoints: [
    'GET /api/shops/:shopId/promises',
    'POST /api/shops/:shopId/promises',
    'GET /api/shops/:shopId/promises/repeat-breakers',
  ],
  todo: [
    'Tabs: pending / kept / broken',
    'Record promise dialog (customer, amount, date)',
    'Repeat breakers callout (2+ broken)',
  ],
  queries: ['Q11 broken promises'],
};

export default function PromisesPage() {
  return <PageStub spec={spec} />;
}
