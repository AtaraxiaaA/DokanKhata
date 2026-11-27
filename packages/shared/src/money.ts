// taka formatting with lakh grouping (1,00,000)
const en = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const en2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bn = new Intl.NumberFormat('bn-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const bn2 = new Intl.NumberFormat('bn-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface TakaOptions {
  // always 2 decimals (statements, receipts)
  exact?: boolean;
  // bangla digits: ৳১,২৩,৪৫০
  bangla?: boolean;
}

export function formatTaka(amount: number | null | undefined, opts: TakaOptions = {}): string {
  const n = Number(amount ?? 0);
  // whole taka shows no decimals, anything with paisa always shows two (৳67,055.60, not ৳67,055.6)
  const paisa = opts.exact || !Number.isInteger(Math.round(n * 100) / 100);
  const fmt = opts.bangla ? (paisa ? bn2 : bn) : paisa ? en2 : en;
  const s = fmt.format(Math.abs(n));
  return `${n < 0 ? '−' : ''}৳${s}`;
}

// short version for dashboards: ৳1.2L, ৳3.4Cr, ৳12.5K
export function formatTakaCompact(amount: number): string {
  const n = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (n >= 1e7) return `${sign}৳${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${sign}৳${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${sign}৳${(n / 1e3).toFixed(1)}K`;
  return `${sign}৳${n.toFixed(0)}`;
}
