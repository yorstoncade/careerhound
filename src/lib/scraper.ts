import type { Company, PrismaClient } from "@prisma/client";
import pLimit from "p-limit";
import { getAdapter, type NormalizedJob } from "./ats";

export type Fetcher = (url: string, company: Company) => Promise<unknown>;

export const liveFetcher: Fetcher = async (url) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "JobScout/0.1 (job aggregator)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 404) throw Object.assign(new Error("board not found (404)"), { fatal: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      lastErr = cause ? new Error(`${(e as Error).message}: ${cause.code ?? cause.message}`) : e;
      // DNS failures won't fix themselves on retry (offline, or a blocked/misspelled host).
      if (cause?.code && ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(cause.code)) break;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
};

export interface CompanyResult {
  company: string;
  ok: boolean;
  found: number;
  created: number;
  closed: number;
  error?: string;
}

/** Save a company's current jobs: upsert what we saw, close anything we didn't. */
export async function saveJobs(db: PrismaClient, companyId: string, jobs: NormalizedJob[], now = new Date()) {
  const seen = new Map<string, NormalizedJob>();
  for (const j of jobs) seen.set(j.externalId, j); // de-dupe within a board

  const existing = await db.job.findMany({ where: { companyId }, select: { id: true, externalId: true } });
  const existingIds = new Set(existing.map((e) => e.externalId));
  let created = 0;

  // Batch writes in transactions; SQLite is much faster that way.
  const ops = [...seen.values()].map((j) => {
    if (!existingIds.has(j.externalId)) created++;
    const data = { ...j, lastSeenAt: now, isActive: true };
    return db.job.upsert({
      where: { companyId_externalId: { companyId, externalId: j.externalId } },
      create: { ...data, companyId, firstSeenAt: now },
      update: data,
    });
  });
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));

  const closed = await db.job.updateMany({
    where: { companyId, isActive: true, externalId: { notIn: [...seen.keys()] } },
    data: { isActive: false },
  });
  return { found: seen.size, created, closed: closed.count };
}

export async function scrapeCompany(db: PrismaClient, company: Company, fetcher: Fetcher): Promise<CompanyResult> {
  const adapter = getAdapter(company.ats);
  const now = new Date();
  try {
    const raw = await fetcher(adapter.url(company.token), company);
    const jobs = adapter.parse(raw, company.token);
    const r = await saveJobs(db, company.id, jobs, now);
    await db.company.update({ where: { id: company.id }, data: { lastScrapedAt: now, lastError: null } });
    return { company: company.name, ok: true, ...r };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.company.update({ where: { id: company.id }, data: { lastError: error.slice(0, 500) } });
    return { company: company.name, ok: false, found: 0, created: 0, closed: 0, error };
  }
}

export async function scrapeAll(
  db: PrismaClient,
  fetcher: Fetcher,
  opts: { concurrency?: number; only?: string[]; onResult?: (r: CompanyResult) => void } = {},
) {
  const companies = await db.company.findMany({
    where: opts.only?.length ? { slug: { in: opts.only } } : undefined,
    orderBy: { name: "asc" },
  });
  const limit = pLimit(opts.concurrency ?? 8);
  return Promise.all(
    companies.map((c) =>
      limit(async () => {
        const r = await scrapeCompany(db, c, fetcher);
        opts.onResult?.(r);
        return r;
      }),
    ),
  );
}
