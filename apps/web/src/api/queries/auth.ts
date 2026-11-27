// register a shop / claim a customer login. both log the person straight in,
// so we drop the new user into the "me" cache and the guards pick it up
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClaimInput, RegisterShopInput } from '@dokankhata/shared';
import { api, call } from '@/api/client';

export function useRegisterShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterShopInput) =>
      call(api.auth['register-shop'].$post({ json: input })),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useClaimStart() {
  return useMutation({
    mutationFn: (phone: string) => call(api.auth.claim.start.$post({ json: { phone } })),
  });
}

export function useClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClaimInput) => call(api.auth.claim.$post({ json: input })),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}
