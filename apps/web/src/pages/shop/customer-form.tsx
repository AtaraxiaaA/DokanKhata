// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Add / edit customer',
  owner: 'Member 3',
  description:
    'Find a person by phone (shared identity across shops) and open or edit their account here.',
  endpoints: [
    'GET /api/shops/:shopId/customers/lookup',
    'POST /api/shops/:shopId/customers',
    'PATCH /api/shops/:shopId/customers/:shopCustomerId',
    'POST /api/shops/:shopId/customers/:shopCustomerId/guarantors',
  ],
  todo: [
    'Phone first: if the person exists elsewhere, prefill name and show their trust score',
    'Credit limit + due days default from shop settings',
    'Block / unblock with a required reason (manager only; audited by trigger T13)',
    "Add guarantor (jamindar) from this shop's customers",
  ],
  queries: ['Q12 guarantor risk (show warning)'],
};

export default function CustomerFormPage() {
  return <PageStub spec={spec} />;
}
