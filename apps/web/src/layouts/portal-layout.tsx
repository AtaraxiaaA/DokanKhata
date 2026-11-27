// customer portal layout. most customers will be on phones, so there's a bottom tab bar on mobile
import { NavLink, Outlet } from 'react-router';
import { BadgeCheck, FileText, Home, Wallet } from 'lucide-react';
import { Logo } from '@/components/app/logo';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { UserMenu } from '@/components/app/user-menu';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/me', label: 'Balances', icon: Home, end: true },
  { to: '/me/statement', label: 'Statement', icon: FileText },
  { to: '/me/pay', label: 'Pay', icon: Wallet },
  { to: '/me/trust', label: 'Trust score', icon: BadgeCheck },
];

export function PortalLayout() {
  return (
    <div className="min-h-svh bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'bg-accent font-medium text-accent-foreground',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 md:p-8">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-background/95 backdrop-blur md:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground',
                isActive && 'text-primary',
              )
            }
          >
            <t.icon className="size-5" />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
