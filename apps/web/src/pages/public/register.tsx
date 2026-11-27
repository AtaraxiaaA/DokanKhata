// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Register your shop',
  owner: 'Member 1',
  description:
    'Owner account + shop in one form. The shop starts as pending until an admin verifies it.',
  endpoints: ['POST /api/auth/register-shop', 'GET /api/meta/areas'],
  todo: [
    'Multi-step form: owner (name, phone, password) → shop (name, type, trade licence, area, address)',
    'Area select grouped by division → district → thana',
    'Server: one transaction inserting users (role=owner) + shops (status=pending), then log in',
    'Show the "pending verification" state after success',
  ],
};

export default function RegisterPage() {
  return <PageStub spec={spec} />;
}
