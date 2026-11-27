import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NewSaleInput } from '@dokankhata/shared';
import { api, call } from '@/api/client';
import { customerKeys } from './customers';
import { productKeys } from './products';

// records a sale, then refetches balances and stock
export function useCreateSale(shopId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSaleInput) =>
      call(api.shops[':shopId'].sales.$post({ param: { shopId: String(shopId) }, json: input })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: customerKeys.all(shopId) });
      void qc.invalidateQueries({ queryKey: productKeys.all(shopId) });
    },
  });
}
