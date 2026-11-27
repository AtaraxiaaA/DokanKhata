// react-query hooks for the admin pages
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/api/client';

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  shops: (status?: string, q?: string) => ['admin', 'shops', status ?? 'all', q ?? ''] as const,
  users: (f: Record<string, string | undefined>) => ['admin', 'users', f] as const,
  audit: (f: Record<string, string | undefined>) => ['admin', 'audit', f] as const,
  areaRisk: (level: string) => ['admin', 'area-risk', level] as const,
  exposure: (minShops: number) => ['admin', 'exposure', minShops] as const,
};

export function useAdminOverview() {
  return useQuery({ queryKey: adminKeys.overview, queryFn: () => call(api.admin.overview.$get()) });
}

export function useAdminShops(status?: 'pending' | 'active' | 'suspended' | 'closed', q?: string) {
  return useQuery({
    queryKey: adminKeys.shops(status, q),
    queryFn: () => call(api.admin.shops.$get({ query: { status, q: q || undefined } })),
    placeholderData: keepPreviousData,
  });
}

export function useVerifyShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { shopId: number; action: 'approve' | 'suspend' | 'reactivate' }) =>
      call(
        api.admin.shops[':shopId'].verify.$patch({
          param: { shopId: String(v.shopId) },
          json: { action: v.action },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useAdminUsers(f: {
  role?: 'owner' | 'staff' | 'customer' | 'admin';
  status?: 'active' | 'suspended';
  q?: string;
  offset?: number;
}) {
  const query = {
    role: f.role,
    status: f.status,
    q: f.q || undefined,
    limit: '50',
    offset: String(f.offset ?? 0),
  };
  return useQuery({
    queryKey: adminKeys.users(query),
    queryFn: () => call(api.admin.users.$get({ query })),
    placeholderData: keepPreviousData,
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: number; status: 'active' | 'suspended' }) =>
      call(
        api.admin.users[':userId'].$patch({
          param: { userId: String(v.userId) },
          json: { status: v.status },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useAuditLog(f: { from?: string; to?: string; offset?: number }) {
  const query = {
    from: f.from || undefined,
    to: f.to || undefined,
    limit: '50',
    offset: String(f.offset ?? 0),
  };
  return useQuery({
    queryKey: adminKeys.audit(query),
    queryFn: () => call(api.admin['audit-log'].$get({ query })),
    placeholderData: keepPreviousData,
  });
}

export function useAreaRisk(level: 'area' | 'thana' | 'district') {
  return useQuery({
    queryKey: adminKeys.areaRisk(level),
    queryFn: () => call(api.admin.reports['area-risk'].$get({ query: { level } })),
    placeholderData: keepPreviousData,
  });
}

export function useExposure(minShops: number) {
  return useQuery({
    queryKey: adminKeys.exposure(minShops),
    queryFn: () => call(api.admin.reports.exposure.$get({ query: { minShops: String(minShops) } })),
    placeholderData: keepPreviousData,
  });
}
