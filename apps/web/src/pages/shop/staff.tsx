// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Staff',
  owner: 'Member 3',
  description: 'Who works here and who may give credit.',
  endpoints: [
    'GET /api/shops/:shopId/staff',
    'POST /api/shops/:shopId/staff',
    'PATCH /api/shops/:shopId/staff/:userId',
  ],
  todo: [
    'List: name, phone, role, can give credit (switch), joined/left',
    'Add staff by phone',
    'Mark as left (sets left_on)',
  ],
};

export default function StaffPage() {
  return <PageStub spec={spec} />;
}
