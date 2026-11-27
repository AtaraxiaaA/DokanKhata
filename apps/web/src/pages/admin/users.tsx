// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'User management',
  owner: 'Member 1',
  description: 'Every login on the platform.',
  endpoints: ['GET /api/admin/users', 'PATCH /api/admin/users/:userId'],
  todo: [
    'Table with role and status filters, search',
    'Suspend / reactivate (also logs them out everywhere)',
  ],
};

export default function UsersPage() {
  return <PageStub spec={spec} />;
}
