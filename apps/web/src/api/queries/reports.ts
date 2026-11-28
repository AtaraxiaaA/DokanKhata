// react-query hooks for the shop reports (aging, and later trend, top debtors...)
import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/api/client';

export const reportKeys = {
  aging: (shopId: number) => ['reports', shopId, 'aging'] as const,
};

export function useAgingReport(shopId: number) {
  return useQuery({
    queryKey: reportKeys.aging(shopId),
    queryFn: () =>
      call(api.shops[':shopId'].reports.aging.$get({ param: { shopId: String(shopId) } })),
  });
}