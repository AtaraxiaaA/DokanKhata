import { cn } from '@/lib/utils';

export function trustBand(score: number | null | undefined) {
  if (score == null)
    return { label: 'New', color: 'var(--muted-foreground)', className: 'text-muted-foreground' };
  if (score >= 80) return { label: 'Reliable', color: 'var(--success)', className: 'text-success' };
  if (score >= 60) return { label: 'Fair', color: 'var(--info)', className: 'text-info' };
  if (score >= 40) return { label: 'Risky', color: 'var(--warning)', className: 'text-warning' };
  return { label: 'High risk', color: 'var(--destructive)', className: 'text-destructive' };
}

// round 0-100 gauge, size in px
export function TrustScoreRing({
  score,
  size = 64,
  stroke = 6,
  showLabel = false,
  className,
}: {
  score: number | null | undefined;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const band = trustBand(score);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  return (
    <div className={cn('inline-flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={band.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <span
          className="tabular absolute inset-0 grid place-items-center font-semibold"
          style={{ fontSize: size * 0.3 }}
          aria-label={`Trust score ${score ?? 'not yet calculated'}`}
        >
          {score ?? '–'}
        </span>
      </div>
      {showLabel && <span className={cn('text-xs font-medium', band.className)}>{band.label}</span>}
    </div>
  );
}
