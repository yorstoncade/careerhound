import type { NormalizedJob } from "./ats/types";

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Convert HTML job descriptions to readable plain text, keeping paragraph breaks. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  // Greenhouse double-encodes its HTML, so decode first if it looks escaped.
  let s = /&lt;\w/.test(html) ? decodeEntities(html) : html;
  s = s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isRemote(...parts: (string | null | undefined | boolean)[]): boolean {
  return parts.some((p) => (typeof p === "boolean" ? p : !!p && /\b(remote|anywhere|distributed|work from home|wfh)\b/i.test(p)));
}

const SENIORITY_RULES: [string, RegExp][] = [
  ["Intern", /\b(intern|internship|co-?op|apprentice)\b/i],
  ["Executive", /\b(chief|c[etofm]o|vp|vice president|head of|svp|evp)\b/i],
  ["Director", /\bdirector\b/i],
  ["Manager", /\bmanager\b/i],
  ["Principal", /\b(principal|distinguished|fellow)\b/i],
  ["Staff", /\bstaff\b/i],
  ["Lead", /\b(lead|tech lead)\b/i],
  ["Senior", /\b(senior|sr\.?|iii|iv)\b/i],
  ["Junior", /\b(junior|jr\.?|entry[- ]level|graduate|new grad|associate)\b/i],
];

export function detectSeniority(title: string): string {
  for (const [label, re] of SENIORITY_RULES) if (re.test(title)) return label;
  return "Mid";
}

export const SENIORITY_LEVELS = ["Intern", "Junior", "Mid", "Senior", "Lead", "Staff", "Principal", "Manager", "Director", "Executive"];

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "₹": "INR" };

function toNumber(raw: string, suffix?: string): number {
  let n = parseFloat(raw.replace(/,/g, ""));
  if (suffix && /k/i.test(suffix)) n *= 1000;
  return Math.round(n);
}

/**
 * Extract an annual salary range from free text, e.g. "$120,000 - $150,000", "£60k–£80k", "USD 90K to 110K".
 * Ignores hourly rates and implausible numbers.
 */
export function parseSalary(text: string): { min: number; max: number; currency: string } | null {
  const sym = "([$£€₹]|USD|GBP|EUR|CAD|AUD|INR)";
  const num = "(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*([kK])?";
  const re = new RegExp(`${sym}\\s?${num}\\s*(?:-|–|—|to)\\s*${sym}?\\s?${num}`, "g");
  for (const m of text.matchAll(re)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 20);
    if (/^\s*(\/|per)\s*(hr|hour)/i.test(after)) continue;
    const min = toNumber(m[2], m[3]);
    const max = toNumber(m[5], m[6] ?? m[3]);
    if (min < 10000 || max < min || max > 2_000_000) continue;
    const c = m[1].toUpperCase();
    return { min, max, currency: CURRENCY_SYMBOLS[m[1]] ?? c };
  }
  return null;
}

/** Fill derived fields (remote, seniority, salary from text) that the ATS didn't provide. */
export function finalize(job: Omit<NormalizedJob, "seniority"> & { seniority?: string | null }): NormalizedJob {
  const out: NormalizedJob = { ...job, seniority: job.seniority ?? detectSeniority(job.title) };
  out.remote = out.remote || isRemote(out.location, out.title);
  if (out.salaryMin == null && out.salaryMax == null) {
    const s = parseSalary(out.descriptionText);
    if (s) {
      out.salaryMin = s.min;
      out.salaryMax = s.max;
      out.salaryCurrency = s.currency;
    }
  }
  out.location = out.location.trim() || (out.remote ? "Remote" : "Unspecified");
  return out;
}

export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}
