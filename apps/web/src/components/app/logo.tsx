import { cn } from '@/lib/utils';

// logo: an open khata with a taka sign
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path
        d="M8 10.5c2.6-1.3 5.3-1.3 8 0v12c-2.7-1.3-5.4-1.3-8 0z"
        fill="var(--primary-foreground)"
        opacity=".95"
      />
      <path
        d="M16 10.5c2.7-1.3 5.4-1.3 8 0v12c-2.6-1.3-5.3-1.3-8 0z"
        fill="var(--primary-foreground)"
        opacity=".7"
      />
      <path
        d="M19 14.2h3.2M20.6 13v5.2c0 .9.6 1.4 1.5 1.2"
        stroke="var(--primary)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="25" cy="8" r="2.4" fill="var(--brand-amber)" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">DokanKhata</span>
          <span className="font-bangla text-[11px] text-muted-foreground">দোকানখাতা</span>
        </span>
      )}
    </span>
  );
}
