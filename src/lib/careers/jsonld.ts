import * as cheerio from "cheerio";
import { finalize, htmlToText, toDate } from "../normalize";
import type { NormalizedJob } from "../ats/types";

type Node = Record<string, unknown>;

const EMPLOYMENT: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACTOR: "Contract", TEMPORARY: "Temporary",
  INTERN: "Internship", VOLUNTEER: "Volunteer", PER_DIEM: "Per diem", OTHER: "Other",
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Raw newlines/tabs inside strings are a common CMS mistake; they're harmless as spaces.
    try {
      return JSON.parse(text.replace(/[\n\r\t]+/g, " "));
    } catch {
      return null;
    }
  }
}

function isType(node: Node, type: string) {
  const t = node["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

/** Walk JSON-LD (arrays, @graph, ItemList) and collect every JobPosting node. */
function collect(value: unknown, out: Node[], depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, depth + 1);
    return;
  }
  const node = value as Node;
  if (isType(node, "JobPosting")) {
    out.push(node);
    return;
  }
  if (node["@graph"]) collect(node["@graph"], out, depth + 1);
  if (isType(node, "ItemList") && Array.isArray(node.itemListElement)) {
    for (const el of node.itemListElement as Node[]) collect(el?.item ?? el, out, depth + 1);
  }
}

const str = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "name" in v) return str((v as Node).name);
  return undefined;
};

function formatPlace(loc: unknown): string | undefined {
  if (!loc || typeof loc !== "object") return str(loc);
  const addr = (loc as Node).address ?? loc;
  if (typeof addr === "string") return addr.trim();
  const a = addr as Node;
  const parts = [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry)].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(", ") : str((loc as Node).name);
}

function toArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function salary(node: Node): { min: number | null; max: number | null; currency: string | null } {
  const none = { min: null, max: null, currency: null };
  const base = node.baseSalary as Node | undefined;
  if (!base || typeof base !== "object") return none;
  const value = (base.value ?? base) as Node;
  const unit = String(value.unitText ?? base.unitText ?? "YEAR").toUpperCase();
  if (unit !== "YEAR") return none; // like the other adapters, only annual salaries
  const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v)));
  const min = num(value.minValue) ?? num(value.value);
  const max = num(value.maxValue) ?? num(value.value);
  if (min == null && max == null) return none;
  return { min, max, currency: str(base.currency) ?? str(value.currency) ?? null };
}

function toJob(node: Node, pageUrl: string): NormalizedJob | null {
  const title = str(node.title) ?? str(node.name);
  if (!title) return null;
  const locations = toArray(node.jobLocation).map(formatPlace).filter(Boolean) as string[];
  const remote = toArray(node.jobLocationType as string | string[]).some((t) => /telecommute/i.test(String(t)));
  if (!locations.length && remote) {
    const where = toArray(node.applicantLocationRequirements).map(formatPlace).filter(Boolean);
    locations.push(where.length ? `Remote - ${where.join(", ")}` : "Remote");
  }
  const ident = node.identifier;
  const identValue = ident && typeof ident === "object" ? str((ident as Node).value) : str(ident);
  const url = str(node.url) ?? str((node as Node).directApplyUrl);
  const applyUrl = url ? new URL(url, pageUrl).toString() : pageUrl;
  const s = salary(node);
  const employment = toArray(node.employmentType as string | string[])
    .map((e) => EMPLOYMENT[String(e).toUpperCase().replace(/[\s-]/g, "_")] ?? String(e))
    .join(", ");
  return finalize({
    externalId: identValue ?? applyUrl,
    title,
    department: str(node.occupationalCategory) ?? str((node as Node).department) ?? null,
    location: [...new Set(locations)].join(" · "),
    remote,
    employmentType: employment || null,
    salaryMin: s.min,
    salaryMax: s.max,
    salaryCurrency: s.currency,
    descriptionText: htmlToText(str(node.description) ?? ""),
    applyUrl,
    postedAt: toDate(str(node.datePosted)),
  });
}

/** All schema.org JobPostings embedded in a page as JSON-LD. */
export function extractJobPostings(html: string, pageUrl: string): NormalizedJob[] {
  const $ = cheerio.load(html);
  const nodes: Node[] = [];
  $('script[type="application/ld+json"]').each((_, el) => collect(parseJson($(el).text()), nodes));
  return nodes.map((n) => toJob(n, pageUrl)).filter((j): j is NormalizedJob => j !== null);
}

/** The hiring organization named in a page's JSON-LD, if any. */
export function jsonLdOrganization(html: string): string | undefined {
  const $ = cheerio.load(html);
  const nodes: Node[] = [];
  $('script[type="application/ld+json"]').each((_, el) => collect(parseJson($(el).text()), nodes));
  for (const n of nodes) {
    const name = str(n.hiringOrganization);
    if (name) return name;
  }
  return undefined;
}
