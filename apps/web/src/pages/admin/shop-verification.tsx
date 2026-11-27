// approve new shops, suspend or bring back existing ones
import { useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  ShieldOff,
  Store,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/api/client';
import { useAdminShops, useVerifyShop } from '@/api/queries/admin';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { Money } from '@/components/app/money';
import { PageHeader } from '@/components/app/page-header';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Pill } from '@/components/app/status-badge';
import { useDebounced } from '@/hooks/use-debounced';

type Status = 'pending' | 'active' | 'suspended';
const TONE = { pending: 'amber', active: 'green', suspended: 'red', closed: 'gray' } as const;

export default function ShopVerificationPage() {
  const [tab, setTab] = useState<Status | 'all'>('pending');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const shops = useAdminShops(tab === 'all' ? undefined : tab, q);
  const verify = useVerifyShop();

  const act = async (
    shopId: number,
    name: string,
    action: 'approve' | 'suspend' | 'reactivate',
  ) => {
    try {
      await verify.mutateAsync({ shopId, action });
      const done = {
        approve: 'approved, it can take baki now',
        suspend: 'suspended',
        reactivate: 'active again',
      }[action];
      toast.success(`${name} ${done}`);
    } catch (e) {
      toast.error('Could not update the shop', { description: errorMessage(e) });
    }
  };

  return (
    <div>
      <PageHeader
        title="Shop verification"
        description="New shops can't record sales or payments until you approve them. Check the owner and trade licence first."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Status | 'all')}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Shop, owner or licence"
            className="pl-9"
          />
        </div>
      </div>

      {shops.isError ? (
        <ErrorState error={shops.error} onRetry={() => shops.refetch()} />
      ) : shops.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : shops.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === 'pending' ? CheckCircle2 : Store}
            title={tab === 'pending' ? 'No shops waiting' : 'No shops here'}
            description={tab === 'pending' ? 'You’re all caught up.' : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {shops.data.map((s) => (
            <Card key={s.shopId} className="gap-0 p-0">
              <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Store className="size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{s.name}</h3>
                    <Pill t={TONE[s.status as keyof typeof TONE] ?? 'gray'}>{s.status}</Pill>
                    <span className="text-xs text-muted-foreground capitalize">
                      {s.shopType.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <span className="flex items-center gap-1.5">
                      <UserRound className="size-3.5" /> {s.ownerName} ·{' '}
                      <span className="tabular">{s.ownerPhone}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" /> {s.areaName}, {s.thana}, {s.district}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Phone className="size-3.5" /> <span className="tabular">{s.phone}</span> ·{' '}
                      {s.address}
                    </span>
                    <span>
                      Trade licence:{' '}
                      {s.tradeLicenceNo ? (
                        <span className="tabular text-foreground">{s.tradeLicenceNo}</span>
                      ) : (
                        <span className="text-warning">not given</span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Registered {formatDate(s.createdAt)}
                    {s.verifiedAt &&
                      ` · verified ${formatDate(s.verifiedAt)}${s.verifiedBy ? ` by ${s.verifiedBy}` : ''}`}
                    {s.status !== 'pending' && (
                      <>
                        {' '}
                        · {s.customers} customers · <Money value={s.outstanding} /> owed
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {s.status === 'pending' && (
                    <ConfirmDialog
                      title={`Approve ${s.name}?`}
                      description="The shop goes live straight away and can start recording baki and payments."
                      confirmLabel="Approve"
                      onConfirm={() => act(s.shopId, s.name, 'approve')}
                      trigger={
                        <Button size="sm" disabled={verify.isPending}>
                          {verify.isPending ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <CheckCircle2 />
                          )}{' '}
                          Approve
                        </Button>
                      }
                    />
                  )}
                  {s.status !== 'suspended' && (
                    <ConfirmDialog
                      title={`Suspend ${s.name}?`}
                      description="Staff won't be able to record new sales or payments. Nothing is deleted, and you can bring it back later."
                      confirmLabel="Suspend"
                      destructive
                      onConfirm={() => act(s.shopId, s.name, 'suspend')}
                      trigger={
                        <Button size="sm" variant="outline">
                          <ShieldOff /> Suspend
                        </Button>
                      }
                    />
                  )}
                  {s.status === 'suspended' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={verify.isPending}
                      onClick={() => act(s.shopId, s.name, 'reactivate')}
                    >
                      <RotateCcw /> Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
