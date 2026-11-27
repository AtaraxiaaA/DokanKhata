import { useParams } from 'react-router';
import type { ShopMembership } from '@dokankhata/shared';
import { useAuth } from '@/auth/auth';

// the shop from the URL and the user's role in it
export function useShop(): ShopMembership & { isManager: boolean } {
  const { user } = useAuth();
  const { shopId } = useParams();
  const shop = user?.shops.find((s) => String(s.shopId) === shopId);
  if (!shop) throw new Error('useShop() used outside a shop route');
  return { ...shop, isManager: shop.role !== 'cashier' };
}
