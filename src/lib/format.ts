const SYMBOL: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", CAD: "CA$", AUD: "A$", INR: "₹" };

function short(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (min == null && max == null) return null;
  const sym = currency ? (SYMBOL[currency] ?? `${currency} `) : "";
  if (min != null && max != null && min !== max) return `${sym}${short(min)} – ${sym}${short(max)}`;
  return `${sym}${short((max ?? min)!)}`;
}

export function timeAgo(d: Date | null, now = new Date()): string {
  if (!d) return "";
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))}mo ago`;
  return `${Math.floor(s / (365 * 86400))}y ago`;
}

export function appUrl(path = ""): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
