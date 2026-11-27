// dates come from the API as plain strings ('2026-11-27' or '2026-11-27 14:05:00').
// parse them as local time here, never with new Date(str), or they shift by 6 hours

export function parseDbDate(s: string): Date {
  const [d, t = '00:00:00'] = s.split(' ');
  const [y, m, day] = (d ?? '').split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1, hh ?? 0, mm ?? 0, ss ?? 0);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** 27 Nov 2026 */
export const formatDate = (s: string | null | undefined) =>
  s ? dateFmt.format(parseDbDate(s)) : '—';
/** 27 Nov, 2:05 pm */
export const formatDateTime = (s: string | null | undefined) =>
  s ? dateTimeFmt.format(parseDbDate(s)) : '—';

/** days from today to the date (negative means it's in the past) */
export function daysFromToday(s: string): number {
  const d = parseDbDate(s);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
