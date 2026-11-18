import type { Prisma } from "@prisma/client";
import { SENIORITY_LEVELS } from "./normalize";

export const PAGE_SIZE = 25;

export interface JobFilters {
  q?: string;
  location?: string;
  remote?: boolean;
  department?: string;
  company?: string;
  seniority?: string;
  minSalary?: number;
  posted?: "24h" | "7d" | "30d";
  sort?: "newest" | "salary";
}

const POSTED_MS = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 } as const;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function get(p: Params, key: string): string | undefined {
  const v = p instanceof URLSearchParams ? p.get(key) : p[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 200) : undefined;
}

/** Parse and validate filters from URL search params. Unknown or invalid values are dropped. */
export function parseFilters(p: Params): JobFilters {
  const f: JobFilters = {};
  const q = get(p, "q");
  if (q) f.q = q;
  const location = get(p, "location");
  if (location) f.location = location;
  const remote = get(p, "remote");
  if (remote === "1" || remote === "true") f.remote = true;
  const department = get(p, "department");
  if (department) f.department = department;
  const company = get(p, "company");
  if (company) f.company = company;
  const seniority = get(p, "seniority");
  if (seniority && SENIORITY_LEVELS.includes(seniority)) f.seniority = seniority;
  const minSalary = Number(get(p, "minSalary"));
  if (Number.isFinite(minSalary) && minSalary > 0) f.minSalary = Math.round(minSalary);
  const posted = get(p, "posted");
  if (posted && posted in POSTED_MS) f.posted = posted as JobFilters["posted"];
  const sort = get(p, "sort");
  if (sort === "salary") f.sort = "salary";
  return f;
}

/** Serialize filters back to a query string (stable key order, defaults omitted). */
export function filtersToQuery(f: JobFilters, extra: Record<string, string | number> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false || v === "") continue;
    sp.set(k, v === true ? "1" : String(v));
  }
  for (const [k, v] of Object.entries(extra)) sp.set(k, String(v));
  return sp.toString();
}

export function buildWhere(f: JobFilters, opts: { newSince?: Date; now?: Date } = {}): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [{ isActive: true }];
  if (f.q) {
    for (const term of f.q.split(/\s+/).filter(Boolean).slice(0, 8)) {
      and.push({
        OR: [
          { title: { contains: term } },
          { department: { contains: term } },
          { company: { name: { contains: term } } },
          { descriptionText: { contains: term } },
        ],
      });
    }
  }
  if (f.location) and.push({ location: { contains: f.location } });
  if (f.remote) and.push({ remote: true });
  if (f.department) and.push({ department: { contains: f.department } });
  if (f.company) and.push({ company: { slug: f.company } });
  if (f.seniority) and.push({ seniority: f.seniority });
  if (f.minSalary) and.push({ salaryMax: { gte: f.minSalary } });
  if (f.posted) {
    const since = new Date((opts.now ?? new Date()).getTime() - POSTED_MS[f.posted]);
    and.push({ OR: [{ postedAt: { gte: since } }, { postedAt: null, firstSeenAt: { gte: since } }] });
  }
  if (opts.newSince) and.push({ firstSeenAt: { gt: opts.newSince } });
  return { AND: and };
}

export function buildOrderBy(f: JobFilters): Prisma.JobOrderByWithRelationInput[] {
  if (f.sort === "salary") {
    return [{ salaryMax: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }];
  }
  return [{ postedAt: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }];
}

/** Human-readable summary of filters, used in alert emails and the alert form. */
export function describeFilters(f: JobFilters): string {
  const parts: string[] = [];
  if (f.q) parts.push(`"${f.q}"`);
  if (f.seniority) parts.push(f.seniority);
  if (f.department) parts.push(`in ${f.department}`);
  if (f.remote) parts.push("remote");
  if (f.location) parts.push(`near ${f.location}`);
  if (f.company) parts.push(`at ${f.company}`);
  if (f.minSalary) parts.push(`paying ${f.minSalary.toLocaleString("en-US")}+`);
  return parts.length ? parts.join(", ") : "all new jobs";
}
