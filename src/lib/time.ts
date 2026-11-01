export function relTime(iso: string, now: Date): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  const s = Math.abs(diff);
  if (s < 60) return 'just now';
  let out: string;
  if (s < 3600) out = `${Math.floor(s / 60)}m`;
  else if (s < 86400) out = `${Math.floor(s / 3600)}h`;
  else if (s < 86400 * 7) out = `${Math.floor(s / 86400)}d`;
  else return shortDate(iso);
  return diff < 0 ? `in ${out}` : `${out} ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dayDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function dueLabel(iso: string, now: Date): { text: string; overdue: boolean } {
  const overdue = new Date(iso).getTime() < now.getTime();
  return { text: overdue ? `Overdue since ${dayDate(iso)}` : `Confirm by ${dayDate(iso)}`, overdue };
}
