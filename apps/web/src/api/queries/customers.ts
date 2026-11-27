// react-query hooks for customers. one file like this per API module,
// and put every input in the query key so the cache doesn't mix things up
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PHONE_REGEX } from '@dokankhata/shared';
import { api, call } from '@/api/client';

export const customerKeys = {
  all: (shopId: number) => ['customers', shopId] as const,
  list: (shopId: number, q: Record<string, string | undefined>) =>
    ['customers', shopId, 'list', q] as const,
  lookup: (shopId: number, phone: string) => ['customers', shopId, 'lookup', phone] as const,
};

export function useCustomers(
  shopId: number,
  query: { q?: string; owing?: '1'; status?: 'active' | 'blocked' | 'closed'; limit?: string } = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: customerKeys.list(shopId, query),
    queryFn: () =>
      call(api.shops[':shopId'].customers.$get({ param: { shopId: String(shopId) }, query })),
    placeholderData: keepPreviousData,
  });
}

// only runs once a full phone number is typed
export function useCustomerLookup(shopId: number, phone: string) {
  return useQuery({
    queryKey: customerKeys.lookup(shopId, phone),
    queryFn: () =>
      call(
        api.shops[':shopId'].customers.lookup.$get({
          param: { shopId: String(shopId) },
          query: { phone },
        }),
      ),
    enabled: PHONE_REGEX.test(phone),
    retry: false,
  });
}
