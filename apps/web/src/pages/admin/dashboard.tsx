// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Platform overview',
  owner: 'Member 1',
  description: 'DokanKhata across all shops.',
  endpoints: ['GET /api/admin/overview', 'GET /api/admin/reports/exposure'],
  todo: [
    'StatCards: shops (pending/active), customers, outstanding, overdue',
    'Customers owing 3+ shops (cross-shop exposure)',
    'Recent registrations',
  ],
  queries: ['Q3 cross-shop exposure'],
};

export default function AdminDashboardPage() {
  return <PageStub spec={spec} />;
}
