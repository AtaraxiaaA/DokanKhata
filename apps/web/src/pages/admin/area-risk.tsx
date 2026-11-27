// area risk (Q14): how much of the money owed in each place is overdue.
// switch between area, thana and district level
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MapPinned } from 'lucide-react';
import { formatTaka } from '@dokankhata/shared';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAreaRisk } from '@/api/queries/admin';
import { DataTable } from '@/components/app/data-table';
import { Money } from '@/components/app/money';
import { PageHeader } from '@/components/app/page-header';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Pill } from '@/components/app/status-badge';

type Level = 'area' | 'thana' | 'district';
type Row = NonNullable<ReturnType<typeof useAreaRisk>['data']>[number];

const LEVEL_LABEL: Record<Level, string> = { area: 'Area', thana: 'Thana', district: 'District' };

// how bad an overdue share is, for the badge in the table
function riskPill(pct: number | null) {
  if (pct == null) return <Pill t="gray">No dues</Pill>;
  if (pct >= 40) return <Pill t="red">High</Pill>;
  if (pct >= 20) return <Pill t="amber">Watch</Pill>;
  return <Pill t="green">Low</Pill>;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{r.place}</p>
      <p className="text-muted-foreground">
        <span className="tabular font-medium text-foreground">{r.overduePct ?? 0}%</span> of dues
        are late
      </p>
      <p className="text-muted-foreground">
        {formatTaka(r.overdue)} late of {formatTaka(r.outstanding)} owed
      </p>
      <p className="text-muted-foreground">
        {r.customersOwing} customers owing · {r.shops} shop{r.shops === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export default function AreaRiskPage() {
  const [level, setLevel] = useState<Level>('area');
  const risk = useAreaRisk(level);

  const chartData = useMemo(
    () => (risk.data ?? []).filter((r) => r.outstanding > 0).slice(0, 12),
    [risk.data],
  );

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'place',
        header: LEVEL_LABEL[level],
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.place}</p>
            <p className="text-xs text-muted-foreground">
              {[
                level === 'area' ? row.original.thana : null,
                level !== 'district' ? row.original.district : null,
                row.original.division,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'shops',
        header: 'Shops',
        cell: ({ row }) => <span className="tabular">{row.original.shops}</span>,
      },
      {
        accessorKey: 'customersOwing',
        header: 'Owing',
        cell: ({ row }) => <span className="tabular">{row.original.customersOwing}</span>,
      },
      {
        accessorKey: 'outstanding',
        header: () => <div className="text-right">Owed</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <Money value={row.original.outstanding} />
          </div>
        ),
      },
      {
        accessorKey: 'overdue',
        header: () => <div className="text-right">Late</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <Money
              value={row.original.overdue}
              className={row.original.overdue > 0 ? 'text-destructive' : undefined}
            />
          </div>
        ),
      },
      {
        accessorKey: 'overduePct',
        header: () => <div className="text-right">Late share</div>,
        cell: ({ row }) => (
          <div className="tabular text-right font-medium">{row.original.overduePct ?? 0}%</div>
        ),
      },
      { id: 'risk', header: 'Risk', cell: ({ row }) => riskPill(row.original.overduePct) },
    ],
    [level],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Area risk"
        description="Where late baki piles up. The late share is the part of everything owed in a place that's past its due date."
        actions={
          <Tabs value={level} onValueChange={(v) => setLevel(v as Level)}>
            <TabsList>
              <TabsTrigger value="area">Area</TabsTrigger>
              <TabsTrigger value="thana">Thana</TabsTrigger>
              <TabsTrigger value="district">District</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {risk.isError ? (
        <ErrorState error={risk.error} onRetry={() => risk.refetch()} />
      ) : (
        <>
          <Card className="gap-4 p-5">
            <div>
              <h2 className="font-medium">Late share by {LEVEL_LABEL[level].toLowerCase()}</h2>
              <p className="text-sm text-muted-foreground">
                Highest first. Hover a bar for the amounts.
              </p>
            </div>
            {risk.isPending ? (
              <Skeleton className="h-72 w-full" />
            ) : chartData.length === 0 ? (
              <EmptyState icon={MapPinned} title="No money owed anywhere yet" />
            ) : (
              <div style={{ height: chartData.length * 40 + 32 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 48, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="place"
                      width={150}
                      tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                    />
                    <Bar
                      dataKey="overduePct"
                      fill="var(--chart-1)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={22}
                      isAnimationActive={false}
                    >
                      <LabelList
                        dataKey="overduePct"
                        position="right"
                        formatter={(v: unknown) => `${v ?? 0}%`}
                        style={{ fontSize: 12, fill: 'var(--foreground)' }}
                        className="tabular"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <DataTable
            columns={columns}
            data={risk.data}
            loading={risk.isPending}
            empty={<EmptyState icon={MapPinned} title="No shops yet" />}
          />
        </>
      )}
    </div>
  );
}
