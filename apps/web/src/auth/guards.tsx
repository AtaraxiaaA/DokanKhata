import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import type { UserRole } from '@dokankhata/shared';
import { FullPageSpinner } from '@/components/app/states';
import { homePathFor, useAuth } from './auth';

// only logged-in users with one of these roles get through
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}

// for /shop/:shopId, you have to own or work at that shop
export function RequireShopMember() {
  const { user } = useAuth();
  const { shopId } = useParams();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.shops.some((s) => String(s.shopId) === shopId))
    return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}

// if you're already logged in, /login sends you to your home page
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}
