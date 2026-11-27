// not built yet (Member 4). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Pay due',
  owner: 'Member 4',
  description: 'bKash / Nagad payment PROTOTYPE. No real money moves.',
  endpoints: ['GET /api/portal/balances', 'POST /api/portal/pay'],
  todo: [
    'Pick shop + amount → fake bKash flow (number, OTP, PIN screens) styled like a wallet',
    'Server generates a TrxID and calls sp_record_payment',
    'Success receipt showing which sales were cleared',
  ],
};

export default function PayDuePage() {
  return <PageStub spec={spec} />;
}
