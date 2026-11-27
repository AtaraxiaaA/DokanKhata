import { History, LayoutDashboard, MapPinned, ShieldCheck, Users } from 'lucide-react';
import { Logo } from '@/components/app/logo';
import { AppShell, type NavGroup } from './app-shell';

const nav: NavGroup[] = [
  { items: [{ label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true }] },
  {
    label: 'Platform',
    items: [
      { label: 'Shop verification', to: '/admin/shops', icon: ShieldCheck },
      { label: 'Users', to: '/admin/users', icon: Users },
    ],
  },
  {
    label: 'Risk & records',
    items: [
      { label: 'Area risk', to: '/admin/area-risk', icon: MapPinned },
      { label: 'Audit log', to: '/admin/audit', icon: History },
    ],
  },
];

export function AdminLayout() {
  return (
    <AppShell
      header={
        <div className="flex items-center justify-between px-1 py-1.5 group-data-[collapsible=icon]:px-0">
          <Logo className="group-data-[collapsible=icon]:hidden" />
          <span className="rounded-md bg-brand-amber/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-amber-foreground uppercase group-data-[collapsible=icon]:hidden dark:text-brand-amber">
            Admin
          </span>
        </div>
      }
      nav={nav}
    />
  );
}
