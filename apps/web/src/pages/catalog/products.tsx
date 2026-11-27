// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Product catalog',
  owner: 'Member 3',
  description: "The shared catalog. Add products to this shop's price list.",
  endpoints: [
    'GET /api/shops/:shopId/products/catalog',
    'POST /api/shops/:shopId/products',
    'GET /api/meta/categories',
  ],
  todo: [
    'Grid/list of catalog products by category with Bangla names',
    '"Add to my shop" with price + opening stock',
    'Search',
  ],
};

export default function ProductsPage() {
  return <PageStub spec={spec} />;
}
