const UNITS: Array<[number, string]> = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [7, "d"],
  [4, "w"],
];

export function formatDistanceToNow(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  let diff = Math.max(0, Math.round((Date.now() - then) / 1000));

  if (diff < 5) return "just now";

  let unit = "s";
  for (const [step, next] of UNITS) {
    if (diff < step) break;
    diff = Math.floor(diff / step);
    unit = next;
  }
  return `${diff}${unit} ago`;
}
