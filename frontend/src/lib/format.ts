export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function formatCost(cost: number | null): string {
  if (cost === null) return "unknown";
  return `$${cost.toFixed(2)}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${seconds.toFixed(1)}s`;
}

export function formatTimeOfDay(iso: string): string {
  // ISO strings from server.py are UTC ("...Z"); render the wall-clock UTC
  // time rather than re-localizing, to keep tests' seeded timestamps and
  // rendered output trivially comparable.
  return iso.slice(11, 19);
}

export function formatDayLabel(dateStr: string): string {
  // dateStr: "YYYY-MM-DD"
  const [, month, day] = dateStr.split("-");
  return `${month}-${day}`;
}

export function formatStarted(iso: string): string {
  const [date, time] = iso.split("T");
  const [, month, day] = date.split("-");
  return `${month}/${day} ${time.slice(0, 5)}`;
}

export function formatRelativeToNow(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hr ago";
  return `${diffHr} hr ago`;
}
