// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Shop verification',
  owner: 'Member 1',
  description: 'Approve new shops before they go live.',
  endpoints: ['GET /api/admin/shops?status=pending', 'PATCH /api/admin/shops/:shopId/verify'],
  todo: [
    'Queue of pending shops with owner, trade licence, area',
    'Approve / suspend with ConfirmDialog',
  ],
};

export default function ShopVerificationPage() {
  return <PageStub spec={spec} />;
}
