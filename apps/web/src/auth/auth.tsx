import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, SessionUser } from '@dokankhata/shared';
import { api, ApiError, call } from '@/api/client';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await call(api.auth.me.$get());
      } catch (e) {
        // 401 = not logged in. on the github pages preview there's no server at all, so also nobody
        if (e instanceof ApiError && (e.status === 401 || e.code === 'STATIC_PREVIEW')) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });

  const loginMut = useMutation({
    mutationFn: (input: LoginInput) => call(api.auth.login.$post({ json: input })),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });

  const value: AuthState = {
    user: me.data ?? null,
    loading: me.isPending,
    login: (input) => loginMut.mutateAsync(input),
    logout: async () => {
      await call(api.auth.logout.$post()).catch(() => {});
      // set "me" to null first so the guards redirect straight away, then drop everything
      // else that was cached for this user. (qc.clear() used to remove "me" while the app
      // was still subscribed to it, so the page kept showing the old user)
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// where each role goes after logging in
export function homePathFor(user: SessionUser): string {
  if (user.role === 'admin') return '/admin';
  if (user.role === 'customer') return '/me';
  const first = user.shops[0];
  return first ? `/shop/${first.shopId}` : '/register';
}
