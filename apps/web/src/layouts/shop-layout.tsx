import { Link, useNavigate } from 'react-router';
import {
  AlarmClock,
  BarChart3,
  Boxes,
  CalendarClock,
  ChevronsUpDown,
  FileText,
  Gauge,
  Handshake,
  LayoutDashboard,
  Package,
  Plus,
  ReceiptText,
  Scale,
  Settings,
  ShieldAlert,
  ShoppingBasket,
  Store,
  TrendingUp,
  Trophy,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { LogoMark } from '@/components/app/logo';
import { Pill } from '@/components/app/status-badge';
import { useAuth } from '@/auth/auth';
import { useShop } from '@/lib/use-shop';
import { AppShell, type NavGroup } from './app-shell';

function ShopSwitcher() {
  const { user } = useAuth();
  const shop = useShop();
  const navigate = useNavigate();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <LogoMark className="size-8 shrink-0" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{shop.shopName}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {shop.role}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Your shops
            </DropdownMenuLabel>
            {user?.shops.map((s) => (
              <DropdownMenuItem key={s.shopId} onClick={() => navigate(`/shop/${s.shopId}`)}>
                <Store /> <span className="flex-1 truncate">{s.shopName}</span>
                {s.shopStatus !== 'active' && <Pill t="amber">{s.shopStatus}</Pill>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function ShopLayout() {
  const shop = useShop();
  const b = `/shop/${shop.shopId}`;

  const nav: NavGroup[] = [
    { items: [{ label: 'Dashboard', to: b, icon: LayoutDashboard, end: true }] },
    {
      label: 'Baki',
      items: [
        { label: 'New credit sale', to: `${b}/sales/new`, icon: ShoppingBasket },
        { label: 'Record payment', to: `${b}/payments/new`, icon: Wallet },
        { label: 'Customers', to: `${b}/customers`, icon: Users },
        { label: 'Sales history', to: `${b}/sales`, icon: ReceiptText, end: true },
        { label: 'Payment history', to: `${b}/payments`, icon: FileText, end: true },
      ],
    },
    {
      label: 'Follow-up',
      items: [
        { label: 'Promises', to: `${b}/promises`, icon: Handshake },
        { label: 'Reminders', to: `${b}/reminders`, icon: AlarmClock },
        { label: 'Disputes', to: `${b}/disputes`, icon: ShieldAlert },
        { label: 'Adjustments', to: `${b}/adjustments`, icon: Scale },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { label: 'Products', to: `${b}/products`, icon: Package },
        { label: 'Price & stock', to: `${b}/stock`, icon: Boxes },
      ],
    },
    {
      label: 'Reports',
      items: [
        { label: 'Aging', to: `${b}/reports/aging`, icon: CalendarClock },
        { label: 'Collection trends', to: `${b}/reports/trends`, icon: TrendingUp },
        { label: 'Top debtors', to: `${b}/reports/top-debtors`, icon: Trophy },
        { label: 'Credit by product', to: `${b}/reports/products`, icon: BarChart3 },
        { label: 'Monthly statements', to: `${b}/statements`, icon: FileText },
        ...(shop.isManager
          ? [{ label: 'Staff performance', to: `${b}/reports/staff`, icon: Gauge }]
          : []),
      ],
    },
    ...(shop.isManager
      ? [
          {
            label: 'Shop',
            items: [
              { label: 'Staff', to: `${b}/staff`, icon: UsersRound },
              { label: 'Settings', to: `${b}/settings`, icon: Settings },
            ],
          },
        ]
      : []),
  ];

  return (
    <AppShell
      header={<ShopSwitcher />}
      nav={nav}
      topbar={
        <>
          {shop.shopStatus === 'pending' && <Pill t="amber">Waiting for admin verification</Pill>}
          <div className="ml-auto" />
          {shop.canGiveCredit && (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to={`${b}/sales/new`}>
                <Plus /> New baki
              </Link>
            </Button>
          )}
        </>
      }
    />
  );
}
