// table component for list pages (tanstack table + shadcn table). example:
//
//   const columns: ColumnDef<CustomerBalanceRow>[] = [
//     { accessorKey: 'fullName', header: 'Customer' },
//     { accessorKey: 'balance', header: () => <div className="text-right">Balance</div>,
//       cell: ({ row }) => <div className="text-right"><Money value={row.original.balance} /></div> },
//   ];
//   <DataTable columns={columns} data={rows} loading={q.isPending} onRowClick={(r) => navigate(...)} />
import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyState } from './states';

export function DataTable<T>({
  columns,
  data,
  loading,
  empty,
  onRowClick,
  className,
}: {
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <Table>
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <TableHead
                    key={h.id}
                    className={cn(
                      'h-10 text-xs font-medium text-muted-foreground',
                      h.column.getCanSort() && 'cursor-pointer select-none',
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === 'asc' && <ArrowUp className="size-3" />}
                      {sorted === 'desc' && <ArrowDown className="size-3" />}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length}>
                {empty ?? <EmptyState title="Nothing here yet" />}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(onRowClick && 'cursor-pointer')}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
