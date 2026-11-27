// not built yet (Member 2). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Adjustments & write-offs',
  owner: 'Member 2',
  description:
    'The only way to fix a sale: return, discount, correction or write-off. Nothing is ever deleted.',
  endpoints: ['GET /api/shops/:shopId/adjustments', 'POST /api/shops/:shopId/adjustments'],
  todo: [
    'List with type badge, amount, reason, approved by',
    'New adjustment dialog: pick sale, type, amount (≤ balance), reason',
    'Write-off uses ConfirmDialog (destructive); manager only',
  ],
};

export default function AdjustmentsPage() {
  return <PageStub spec={spec} />;
}
