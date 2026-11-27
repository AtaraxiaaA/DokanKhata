// audit log: every change to a credit limit, due days or account status.
// the trigger on shop_customers writes these, so they can't be skipped from the app
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, History } from 'lucide-react';
import { formatDateTime, formatTaka } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuditLog } from '@/api/queries/admin';
import { DataTable } from '@/components/app/data-table';
import { PageHeader } from '@/components/app/page-header';
import { EmptyState, ErrorState } from '@/components/app/states';

type LogRow = NonNullable<ReturnType<typeof useAuditLog>['data']>['rows'][number];
const PAGE = 50;

const FIELD_LABEL: Record<string, string> = {
  credit_limit: 'Credit limit',
  due_days: 'Due days',
  status: 'Status',
  blocked_reason: 'Block reason',
};

function show(key: string, v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'credit_limit') return formatTaka(Number(v));
  if (key === 'due_days') return `${v} days`;
  return String(v);
}

// only the fields that actually changed
function Changes({
  oldValue,
  newValue,
}: {
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}) {
  const keys = Object.keys({ ...oldValue, ...newValue }).filter(
    (k) => JSON.stringify(oldValue?.[k]) !== JSON.stringify(newValue?.[k]),
  );
  if (!keys.length) return <span className="text-muted-foreground">No visible change</span>;
  return (
    <ul className="space-y-1">
      {keys.map((k) => (
        <li key={k} className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{FIELD_LABEL[k] ?? k}</span>
          <span className="tabular rounded bg-muted px-1.5 py-0.5 text-xs line-through decoration-muted-foreground/50">
            {show(k, oldValue?.[k])}
          </span>
          <ArrowRight className="size-3 text-muted-foreground" />
          <span className="tabular rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            {show(k, newValue?.[k])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AuditLogPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const log = useAuditLog({ from, to, offset });

  const columns = useMemo<ColumnDef<LogRow>[]>(
    () => [
      {
        accessorKey: 'changedAt',
        header: 'When',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDateTime(row.original.changedAt)}
          </span>
        ),
      },
      {
        id: 'account',
        header: 'Account',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">
              {row.original.customerName ?? `#${row.original.recordId}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.shopName ?? row.original.tableName}
            </p>
          </div>
        ),
      },
      {
        id: 'change',
        header: 'What changed',
        cell: ({ row }) => (
          <Changes oldValue={row.original.oldValue} newValue={row.original.newValue} />
        ),
      },
      {
        accessorKey: 'changedBy',
        header: 'By',
        cell: ({ row }) => <span className="font-medium">{row.original.changedBy}</span>,
      },
    ],
    [],
  );

  const total = log.data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change to a customer's credit limit, due days or account status, with who made it. Rows here can't be edited."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
            className="w-40"
          />
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom('');
              setTo('');
              setOffset(0);
            }}
          >
            Clear
          </Button>
        )}
        <p className="ml-auto text-sm text-muted-foreground tabular">{total} changes</p>
      </div>

      {log.isError ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={log.data?.rows}
          loading={log.isPending}
          empty={<EmptyState icon={History} title="Nothing in this period" />}
        />
      )}

      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular">
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset((o) => o + PAGE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
