// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Shop settings',
  owner: 'Member 3',
  description: 'Shop profile and credit defaults for new customers.',
  endpoints: ['GET /api/shops/:shopId/settings', 'PATCH /api/shops/:shopId/settings'],
  todo: [
    'Profile: name, type, address, phone, trade licence',
    'Defaults: credit limit, due days (1–90)',
    'Verification status banner',
  ],
};

export default function SettingsPage() {
  return <PageStub spec={spec} />;
}
