import { SALE_STATUS_LABEL, type AccountStatus, type SaleStatus } from '@dokankhata/shared';
import { cn } from '@/lib/utils';

const tone = {
  green: 'bg-success/12 text-success ring-success/25',
  amber:
    'bg-warning/15 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))] ring-warning/30',
  red: 'bg-destructive/10 text-destructive ring-destructive/25',
  blue: 'bg-info/10 text-info ring-info/25',
  gray: 'bg-muted text-muted-foreground ring-border',
} as const;
type Tone = keyof typeof tone;

export function Pill({
  t,
  children,
  className,
}: {
  t: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        tone[t],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

const SALE_TONE: Record<SaleStatus, Tone> = {
  open: 'blue',
  partially_paid: 'amber',
  paid: 'green',
  overdue: 'red',
  disputed: 'amber',
  written_off: 'gray',
};

export const SaleStatusBadge = ({ status }: { status: SaleStatus }) => (
  <Pill t={SALE_TONE[status]}>{SALE_STATUS_LABEL[status]}</Pill>
);

const ACCOUNT_TONE: Record<AccountStatus, Tone> = {
  active: 'green',
  blocked: 'red',
  closed: 'gray',
};
export const AccountStatusBadge = ({ status }: { status: AccountStatus }) => (
  <Pill t={ACCOUNT_TONE[status]}>{status[0]!.toUpperCase() + status.slice(1)}</Pill>
);
