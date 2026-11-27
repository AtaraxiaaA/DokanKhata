// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Price list & stock',
  owner: 'Member 3',
  description: "This shop's prices and stock levels.",
  endpoints: [
    'GET /api/shops/:shopId/products',
    'PATCH /api/shops/:shopId/products/:shopProductId',
  ],
  todo: [
    'Editable table: price, stock, reorder level, track stock, active',
    'Low stock highlighted',
    'Manager only for edits',
  ],
};

export default function StockPage() {
  return <PageStub spec={spec} />;
}
