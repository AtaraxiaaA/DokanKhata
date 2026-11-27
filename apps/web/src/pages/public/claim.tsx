// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Claim your customer account',
  owner: 'Member 1',
  description:
    "A customer already in some shop's khata creates a portal login with their phone number.",
  endpoints: ['POST /api/auth/claim'],
  todo: [
    'Phone → (prototype) OTP screen with a fixed demo code → set password',
    'Server: create users (role=customer) and set customers.user_id',
    'Reject if the phone is not a known customer or already claimed',
  ],
};

export default function ClaimPage() {
  return <PageStub spec={spec} />;
}
