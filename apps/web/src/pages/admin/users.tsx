// every login on the platform. suspending someone also logs them out everywhere
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatDateTime, USER_ROLES } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/api/client';
import { useAdminUsers, useSetUserStatus } from '@/api/queries/admin';
import { useAuth } from '@/auth/auth';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataTable } from '@/components/app/data-table';
import { PageHeader } from '@/components/app/page-header';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Pill } from '@/components/app/status-badge';
import { initials } from '@/components/app/user-menu';
import { useDebounced } from '@/hooks/use-debounced';

type Role = (typeof USER_ROLES)[number];
type UserRow = NonNullable<ReturnType<typeof useAdminUsers>['data']>['rows'][number];

const ROLE_TONE = { owner: 'blue', staff: 'gray', customer: 'green', admin: 'amber' } as const;
const PAGE = 50;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [status, setStatus] = useState<'active' | 'suspended' | 'all'>('all');
  const [offset, setOffset] = useState(0);
  const q = useDebounced(search.trim(), 250);

  const users = useAdminUsers({
    q,
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    offset,
  });
  const setUserStatus = useSetUserStatus();

  const change = async (u: UserRow, next: 'active' | 'suspended') => {
    try {
      await setUserStatus.mutateAsync({ userId: u.userId, status: next });
      toast.success(
        next === 'suspended'
          ? `${u.fullName} is suspended and logged out`
          : `${u.fullName} can log in again`,
      );
    } catch (e) {
      toast.error('Could not change the account', { description: errorMessage(e) });
    }
  };

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(row.original.fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.fullName}</p>
              <p className="tabular truncate text-xs text-muted-foreground">
                {row.original.phone}
                {row.original.email && ` · ${row.original.email}`}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Pill t={ROLE_TONE[row.original.role as Role] ?? 'gray'}>{row.original.role}</Pill>
        ),
      },
      {
        accessorKey: 'shops',
        header: 'Shop',
        cell: ({ row }) => (
          <span className="block max-w-48 truncate text-muted-foreground">
            {row.original.shops ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Last login',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Never'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Joined',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const u = row.original;
          if (u.userId === me?.userId)
            return <span className="text-xs text-muted-foreground">You</span>;
          return u.status === 'active' ? (
            <ConfirmDialog
              title={`Suspend ${u.fullName}?`}
              description="They'll be logged out on every device and can't log in until you reactivate them. Their records stay."
              confirmLabel="Suspend"
              destructive
              onConfirm={() => change(u, 'suspended')}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Ban /> Suspend
                </Button>
              }
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => change(u, 'active')}>
              <RotateCcw /> Reactivate
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.userId],
  );

  const total = users.data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Owners, staff, customers and admins. Suspended people can't log in."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Name, phone or email"
            className="pl-9"
          />
        </div>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v as Role | 'all');
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.isError ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={users.data?.rows}
          loading={users.isPending}
          empty={
            <EmptyState title="No one matches" description="Try a different name or filter." />
          }
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
