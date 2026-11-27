import { formatTaka, type TakaOptions } from '@dokankhata/shared';
import { cn } from '@/lib/utils';

// use this for every amount on screen
//   <Money value={2315.75} />              ৳2,315.75
//   <Money value={balance} tone="auto" />  red if they owe money
export function Money({
  value,
  tone = 'default',
  className,
  ...opts
}: {
  value: number | null | undefined;
  tone?: 'default' | 'auto' | 'muted';
  className?: string;
} & TakaOptions) {
  const n = Number(value ?? 0);
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        tone === 'auto' && (n > 0 ? 'text-destructive' : 'text-success'),
        tone === 'muted' && 'text-muted-foreground',
        className,
      )}
    >
      {formatTaka(n, opts)}
    </span>
  );
}
