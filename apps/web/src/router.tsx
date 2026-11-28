// all the pages. each one is lazy loaded so it gets its own JS chunk.
// who's building what is in docs/ASSIGNMENTS.md
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { GuestOnly, RequireRole, RequireShopMember } from '@/auth/guards';
import { AdminLayout } from '@/layouts/admin-layout';
import { AuthLayout } from '@/layouts/auth-layout';
import { PortalLayout } from '@/layouts/portal-layout';
import { ShopLayout } from '@/layouts/shop-layout';
import NotFoundPage from '@/pages/not-found';

type PageModule = { default: React.ComponentType };
const page = (load: () => Promise<PageModule>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const router = createBrowserRouter(
  [
    // public
    { path: '/', ...page(() => import('@/pages/public/landing')) },
    {
      element: <GuestOnly />,
      children: [
        {
          element: <AuthLayout />,
          children: [
            { path: '/login', ...page(() => import('@/pages/public/login')) },
            { path: '/register', ...page(() => import('@/pages/public/register')) },
            { path: '/claim', ...page(() => import('@/pages/public/claim')) },
          ],
        },
      ],
    },

    // shop (owner + staff)
    {
      path: '/shop/:shopId',
      element: <RequireRole roles={['owner', 'staff']} />,
      children: [
        {
          element: <RequireShopMember />,
          children: [
            {
              element: <ShopLayout />,
              children: [
                { index: true, ...page(() => import('@/pages/shop/dashboard')) },
                { path: 'customers', ...page(() => import('@/pages/shop/customers')) },
                { path: 'customers/new', ...page(() => import('@/pages/shop/customer-form')) },
                {
                  path: 'customers/:shopCustomerId',
                  ...page(() => import('@/pages/shop/customer-ledger')),
                },
                {
                  path: 'customers/:shopCustomerId/edit',
                  ...page(() => import('@/pages/shop/customer-form')),
                },
                { path: 'sales', ...page(() => import('@/pages/shop/sales-history')) },
                { path: 'sales/new', ...page(() => import('@/pages/shop/new-sale')) },
                { path: 'payments', ...page(() => import('@/pages/shop/payment-history')) },
                { path: 'payments/new', ...page(() => import('@/pages/shop/record-payment')) },
                { path: 'promises', ...page(() => import('@/pages/shop/promises')) },
                { path: 'reminders', ...page(() => import('@/pages/shop/reminders')) },
                { path: 'disputes', ...page(() => import('@/pages/shop/disputes')) },
                { path: 'adjustments', ...page(() => import('@/pages/shop/adjustments')) },
                { path: 'products', ...page(() => import('@/pages/catalog/products')) },
                { path: 'stock', ...page(() => import('@/pages/catalog/stock')) },
                { path: 'staff', ...page(() => import('@/pages/shop/staff')) },
                { path: 'settings', ...page(() => import('@/pages/shop/settings')) },
                { path: 'statements', ...page(() => import('@/pages/reports/statements')) },
                { path: 'reports/aging', ...page(() => import('@/pages/reports/aging')) },
                { path: 'reports/trends', ...page(() => import('@/pages/reports/trends')) },
                {
                  path: 'reports/top-debtors',
                  ...page(() => import('@/pages/reports/top-debtors')),
                },
                {
                  path: 'reports/staff',
                  ...page(() => import('@/pages/reports/staff-performance')),
                },
                {
                  path: 'reports/products',
                  ...page(() => import('@/pages/reports/credit-by-product')),
                },
              ],
            },
          ],
        },
      ],
    },

    // customer portal
    {
      path: '/me',
      element: <RequireRole roles={['customer']} />,
      children: [
        {
          element: <PortalLayout />,
          children: [
            { index: true, ...page(() => import('@/pages/portal/balances')) },
            { path: 'statement', ...page(() => import('@/pages/portal/statement')) },
            {
              path: 'statement/:shopCustomerId',
              ...page(() => import('@/pages/portal/statement')),
            },
            { path: 'pay', ...page(() => import('@/pages/portal/pay')) },
            { path: 'disputes/new', ...page(() => import('@/pages/portal/raise-dispute')) },
            { path: 'trust', ...page(() => import('@/pages/portal/trust')) },
          ],
        },
      ],
    },

    // admin
    {
      path: '/admin',
      element: <RequireRole roles={['admin']} />,
      children: [
        {
          element: <AdminLayout />,
          children: [
            { index: true, ...page(() => import('@/pages/admin/dashboard')) },
            { path: 'shops', ...page(() => import('@/pages/admin/shop-verification')) },
            { path: 'users', ...page(() => import('@/pages/admin/users')) },
            { path: 'area-risk', ...page(() => import('@/pages/admin/area-risk')) },
            { path: 'audit', ...page(() => import('@/pages/admin/audit-log')) },
          ],
        },
      ],
    },

    { path: '/shop', element: <Navigate to="/login" replace /> },
    { path: '*', element: <NotFoundPage /> },
  ],
  // '/' locally, '/DokanKhata' on github pages
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
