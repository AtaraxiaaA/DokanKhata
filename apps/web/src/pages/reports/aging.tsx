// aging report (Q1): how much is owed, and for how long
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgingReport } from '@/api/queries/reports';
import { DataTable } from '@/components/app/data-table';
import { Money } from '@/components/app/money';
import { PageHeader } from '@/components/app/page-header';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Pill } from '@/components/app/status-badge';

type Row = NonNullable<ReturnType<typeof useAgingReport>['data']>['rows'][number];
type BucketKey = 'notYetDue' | 'overdue130' | 'overdue3160' | 'overdue6190' | 'overdue90Plus';

const BUCKETS: { key: BucketKey; label: string; color: string }[] = [
  { key: 'notYetDue', label: 'Not due', color: 'var(--chart-1)' },
  { key: 'overdue130', label: '1–30 days', color: 'var(--chart-2)' },
  { key: 'overdue3160', label: '31–60 days', color: 'var(--chart-3)' },
  { key: 'overdue6190', label: '61–90 days', color: 'var(--chart-4)' },
  { key: 'overdue90Plus', label: '90+ days', color: 'var(--chart-5)' },
];

function csvCell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function downloadCsv(rows: Row[]) {
  const head = ['Customer', 'Phone', ...BUCKETS.map((b) => b.label), 'Total', 'Max days overdue'];
  const lines = rows.map((r) =>
    [
      r.fullName,
      r.phone,
      ...BUCKETS.map((b) => r[b.key]),
      r.totalOutstanding,
      r.maxDaysOverdue,
    ]
      .map(csvCell)
      .join(','),
  );
  const csv = '\uFEFF' + [head.map(csvCell).join(','), ...lines].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aging-report.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function latePill(days: number) {
  if (days <= 0) return <Pill t="green">On time</Pill>;
  if (days <= 30) return <Pill t="amber">{days}d late</Pill>;
  return <Pill t="red">{days}d late</Pill>;
}

export default function AgingReportPage() {
  // TODO: replace with the same shopId line that pages/shop/new-sale.tsx uses
  const shopId = 1;
  const aging = useAgingReport(shopId);
  const [bucket, setBucket] = useState<'all' | BucketKey>('all');

  const rows = useMemo(() => {
    const all = aging.data?.rows ?? [];
    return bucket === 'all' ? all : all.filter((r) => r[bucket] > 0);
  }, [aging.data, bucket]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">{row.original.phone}</p>
          </div>
        ),
      },
      ...BUCKETS.map<ColumnDef<Row>>((b) => ({
        accessorKey: b.key,
        header: () => <div className="text-right">{b.label}</div>,
        cell: ({ row }) => (
          <div className="text-right">
            {row.original[b.key] > 0 ? (
              <Money
                value={row.original[b.key]}
                className={b.key === 'notYetDue' ? undefined : 'text-destructive'}
              />
            ) : (
              <span className="text-muted-foreground">–</span>
            )}
          </div>
        ),
      })),
      {
        accessorKey: 'totalOutstanding',
        header: () => <div className="text-right">Total</div>,
        cell: ({ row }) => (
          <div className="text-right font-medium">
            <Money value={row.original.totalOutstanding} />
          </div>
        ),
      },
      {
        accessorKey: 'maxDaysOverdue',
        header: 'Status',
        cell: ({ row }) => latePill(row.original.maxDaysOverdue),
      },
    ],
    [],
  );

  const totals = aging.data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aging report"
        description="How much is owed, and for how long."
        actions={
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(rows)}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />

      {aging.isError ? (
        <ErrorState error={aging.error} onRetry={() => aging.refetch()} />
      ) : (
        <>
          <Card className="gap-4 p-5">
            <div>
              <h2 className="font-medium">Receivables by age</h2>
              <p className="text-sm text-muted-foreground">
                Everything owed to this shop, split by how late it is.
              </p>
            </div>
            {aging.isPending || !totals ? (
              <Skeleton className="h-24 w-full" />
            ) : totals.totalOutstanding <= 0 ? (
              <EmptyState icon={Hourglass} title="Nothing owed right now" />
            ) : (
              <>
                <div className="flex h-8 w-full overflow-hidden rounded-md bg-muted">
                  {BUCKETS.map((b) => {
                    const pct = (totals[b.key] / totals.totalOutstanding) * 100;
                    return pct > 0 ? (
                      <div
                        key={b.key}
                        style={{ width: `${pct}%`, background: b.color }}
                        title={`${b.label}: ${pct.toFixed(1)}%`}
                      />
                    ) : null;
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {BUCKETS.map((b) => (
                    <div key={b.key} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span
                          className="size-2.5 rounded-sm"
                          style={{ background: b.color }}
                        />
                        {b.label}
                      </div>
                      <Money value={totals[b.key]} className="font-medium" />
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Total outstanding: <Money value={totals.totalOutstanding} className="font-medium text-foreground" />
                </p>
              </>
            )}
          </Card>

          <Tabs value={bucket} onValueChange={(v) => setBucket(v as 'all' | BucketKey)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All</TabsTrigger>
              {BUCKETS.map((b) => (
                <TabsTrigger key={b.key} value={b.key}>
                  {b.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <DataTable
            columns={columns}
            data={aging.isPending ? undefined : rows}
            loading={aging.isPending}
            empty={<EmptyState icon={Hourglass} title="No customers in this group" />}
          />
        </>
      )}
    </div>
  );
}