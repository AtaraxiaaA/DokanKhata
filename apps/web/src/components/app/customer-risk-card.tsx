// the card that shows balance / limit / trust score before giving credit.
// used on new sale, and should be reused on record payment, add customer and the ledger
import { Link } from 'react-router';
import { Ban, Store, TriangleAlert, UserPlus } from 'lucide-react';
import type { CustomerLookup } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Money } from './money';
import { AccountStatusBadge } from './status-badge';
import { TrustScoreRing, trustBand } from './trust-score';

export function CustomerRiskCard({
  data,
  shopId,
  extraBalance = 0,
}: {
  data: CustomerLookup;
  shopId: number;
  // cart total, so the card can show the balance after this sale
  extraBalance?: number;
}) {
  const a = data.account;
  const projected = (a?.balance ?? 0) + extraBalance;
  const usedPct = a && a.creditLimit > 0 ? Math.min(100, (projected / a.creditLimit) * 100) : 0;
  const over = !!a && projected > a.creditLimit;
  const band = trustBand(data.trust?.score);

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-4 p-5">
        <TrustScoreRing score={data.trust?.score} size={60} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{data.fullName}</p>
          <p className="tabular text-sm text-muted-foreground">{data.phone}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={cn('text-xs font-medium', band.className)}>{band.label}</span>
          {a && <AccountStatusBadge status={a.status} />}
        </div>
      </div>

      {a ? (
        <div className="space-y-3 border-t px-5 py-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">
              {extraBalance > 0 ? 'Balance after this sale' : 'Balance'}
            </span>
            <span>
              <Money
                value={projected}
                className={cn('font-semibold', over && 'text-destructive')}
              />
              <span className="text-muted-foreground">
                {' '}
                / <Money value={a.creditLimit} />
              </span>
            </span>
          </div>
          <Progress
            value={usedPct}
            className={cn(
              'h-2',
              over ? '[&>*]:bg-destructive' : usedPct > 80 ? '[&>*]:bg-warning' : '',
            )}
          />
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Available</p>
              <Money value={Math.max(0, a.creditLimit - projected)} className="font-medium" />
            </div>
            <div>
              <p className="text-muted-foreground">Most overdue</p>
              <p className={cn('tabular font-medium', a.maxDaysOverdue > 0 && 'text-destructive')}>
                {a.maxDaysOverdue > 0 ? `${a.maxDaysOverdue} days` : 'None'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Due days</p>
              <p className="tabular font-medium">{a.dueDays} days</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t px-5 py-4 text-sm">
          <span className="text-muted-foreground">
            Known to DokanKhata, but not a customer of this shop yet.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to={`/shop/${shopId}/customers/new?phone=${data.phone}`}>
              <UserPlus /> Add
            </Link>
          </Button>
        </div>
      )}

      {(a?.status === 'blocked' ||
        a?.status === 'closed' ||
        data.otherShops.shopsOwed > 0 ||
        over) && (
        <div className="space-y-2 border-t bg-muted/30 px-5 py-3 text-xs">
          {a && a.status !== 'active' && (
            <p className="flex items-center gap-2 text-destructive">
              <Ban className="size-3.5" /> This account is {a.status}. No new credit can be given.
            </p>
          )}
          {over && (
            <p className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-3.5" /> This sale would go over the credit limit.
            </p>
          )}
          {data.otherShops.shopsOwed > 0 && (
            <p className="flex items-center gap-2">
              <Store className="size-3.5 text-warning" />
              Also owes {data.otherShops.shopsOwed} other shop
              {data.otherShops.shopsOwed > 1 ? 's' : ''} ·{' '}
              <Money value={data.otherShops.outstanding} className="font-medium" />
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
