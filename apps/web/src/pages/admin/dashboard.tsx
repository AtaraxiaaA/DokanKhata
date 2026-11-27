// admin home: platform numbers, people who owe several shops (Q3), newest shops
import { useState } from 'react';
import { Link } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Clock,
  ReceiptText,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { formatDate, formatTakaCompact } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminOverview, useExposure } from '@/api/queries/admin';
import { DataTable } from '@/components/app/data-table';
import { Money } from '@/components/app/money';
import { PageHeader } from '@/components/app/page-header';
import { StatCard } from '@/components/app/stat-card';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Pill } from '@/components/app/status-badge';
import { TrustScoreRing } from '@/components/app/trust-score';

type ExposureRow = NonNullable<ReturnType<typeof useExposure>['data']>[number];

const exposureColumns: ColumnDef<ExposureRow>[] = [
  {
    accessorKey: 'fullName',
    header: 'Customer',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <TrustScoreRing score={row.original.trustScore} size={32} stroke={3.5} />
        <div>
          <p className="font-medium">{row.original.fullName}</p>
          <p className="tabular text-xs text-muted-foreground">{row.original.phone}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'shopsOwed',
    header: 'Shops',
    cell: ({ row }) => (
      <div>
        <p className="tabular font-medium">{row.original.shopsOwed}</p>
        <p
          className="max-w-64 truncate text-xs text-muted-foreground"
          title={row.original.shopNames}
        >
          {row.original.shopNames}
        </p>
      </div>
    ),
  },
  {
    accessorKey: 'totalOutstanding',
    header: () => <div className="text-right">Owes in total</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <Money value={row.original.totalOutstanding} className="font-medium" />
      </div>
    ),
  },
  {
    accessorKey: 'maxDaysOverdue',
    header: 'Late',
    cell: ({ row }) =>
      row.original.maxDaysOverdue > 0 ? (
        <Pill t="red">
          <Money value={row.original.overdueAmount} /> · {row.original.maxDaysOverdue}d
        </Pill>
      ) : (
        <Pill t="green">On time</Pill>
      ),
  },
];

const STATUS_TONE = {
  pending: 'amber',
  active: 'green',
  suspended: 'red',
  closed: 'gray',
} as const;

export default function AdminDashboardPage() {
  const overview = useAdminOverview();
  const [minShops, setMinShops] = useState(2);
  const exposure = useExposure(minShops);
  const o = overview.data;

  if (overview.isError)
    return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform overview"
        description="Every shop on DokanKhata at a glance."
        actions={
          o && o.counts.pendingShops > 0 ? (
            <Button asChild>
              <Link to="/admin/shops">
                <ShieldCheck /> Review {o.counts.pendingShops} pending shop
                {o.counts.pendingShops > 1 ? 's' : ''}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Shops"
          icon={Store}
          loading={!o}
          value={<span className="tabular">{o?.counts.shops}</span>}
          hint={o && `${o.counts.pendingShops} waiting for verification`}
        />
        <StatCard
          label="Customers"
          icon={Users}
          loading={!o}
          value={<span className="tabular">{o?.counts.customers}</span>}
          hint={o && `${o.money.customersOwing} accounts owe money right now`}
        />
        <StatCard
          label="Credit given, last 30 days"
          icon={ReceiptText}
          loading={!o}
          value={o && formatTakaCompact(o.counts.creditLast30)}
          hint={o && `${o.counts.salesLast30} sales`}
        />
        <StatCard
          label="Money out on baki"
          icon={Banknote}
          loading={!o}
          value={o && <Money value={o.money.totalOutstanding} />}
          hint="across all shops"
        />
        <StatCard
          label="Overdue"
          icon={AlertTriangle}
          loading={!o}
          value={o && <Money value={o.money.overdueAmount} className="text-destructive" />}
          hint={
            o && o.money.totalOutstanding > 0
              ? `${((100 * o.money.overdueAmount) / o.money.totalOutstanding).toFixed(1)}% of what's owed`
              : undefined
          }
        />
        <StatCard
          label="Logins"
          icon={Clock}
          loading={!o}
          value={<span className="tabular">{o?.counts.users}</span>}
          hint="owners, staff, customers and admins"
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Owing several shops</h2>
            <p className="text-sm text-muted-foreground">
              Customers with unpaid baki at more than one shop at the same time. No single shop can
              see this.
            </p>
          </div>
          <Tabs value={String(minShops)} onValueChange={(v) => setMinShops(Number(v))}>
            <TabsList>
              <TabsTrigger value="2">2+ shops</TabsTrigger>
              <TabsTrigger value="3">3+ shops</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {exposure.isError ? (
          <ErrorState error={exposure.error} onRetry={() => exposure.refetch()} />
        ) : (
          <DataTable
            columns={exposureColumns}
            data={exposure.data}
            loading={exposure.isPending}
            empty={
              <EmptyState title="Nobody owes that many shops" description="That’s good news." />
            }
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-semibold">Newest shops</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/shops">
              All shops <ArrowRight />
            </Link>
          </Button>
        </div>
        <Card className="gap-0 divide-y p-0">
          {(o?.recentShops ?? []).map((s) => (
            <div key={s.shopId} className="flex items-center gap-4 px-5 py-3.5">
              <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Store className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.ownerName} · {s.areaName} · joined {formatDate(s.createdAt)}
                </p>
              </div>
              <Pill t={STATUS_TONE[s.status as keyof typeof STATUS_TONE] ?? 'gray'}>
                {s.status}
              </Pill>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
