import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/api/client';

export const productKeys = {
  all: (shopId: number) => ['products', shopId] as const,
};

export function useShopProducts(shopId: number) {
  return useQuery({
    queryKey: productKeys.all(shopId),
    queryFn: () =>
      call(api.shops[':shopId'].products.$get({ param: { shopId: String(shopId) }, query: {} })),
  });
}
