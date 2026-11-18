import type { Company, PrismaClient } from "@prisma/client";
import pLimit from "p-limit";
import { getAdapter, type NormalizedJob, type ScrapeContext } from "./ats";
import { createRenderer } from "./careers/render";
import { createHttp } from "./http";

export interface CompanyResult {
  company: string;
  ok: boolean;
  found: number;
  created: number;
  closed: number;
  method?: string;
  upgradedTo?: string;
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

export async function scrapeCompany(db: PrismaClient, company: Company, ctx: ScrapeContext): Promise<CompanyResult> {
  const now = new Date();
  try {
    const outcome = await getAdapter(company.ats).scrape(company, ctx);
    const r = await saveJobs(db, company.id, outcome.jobs, now);
    let upgradedTo: string | undefined;
    const data: Parameters<typeof db.company.update>[0]["data"] = {
      lastScrapedAt: now,
      lastError: null,
      scrapeMethod: outcome.method,
    };
    // A careers page that turns out to use a known platform switches to that platform's faster API,
    // unless another company already tracks that board.
    if (outcome.upgrade && company.ats === "careers-page") {
      const taken = await db.company.findUnique({ where: { ats_token: outcome.upgrade } });
      if (!taken) {
        Object.assign(data, { ...outcome.upgrade, careersUrl: company.careersUrl ?? company.token });
        upgradedTo = outcome.upgrade.ats;
      }
    }
    await db.company.update({ where: { id: company.id }, data });
    return { company: company.name, ok: true, method: outcome.method, upgradedTo, ...r };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.company.update({ where: { id: company.id }, data: { lastError: error.slice(0, 500) } });
    return { company: company.name, ok: false, found: 0, created: 0, closed: 0, error };
  }
}

/** A scrape context with live HTTP and a headless browser that starts only if some page needs it. */
export function createContext(): ScrapeContext & { close: () => Promise<void> } {
  const renderer = createRenderer();
  return { http: createHttp(), render: renderer.render, close: renderer.close };
}

export async function scrapeAll(
  db: PrismaClient,
  ctx: ScrapeContext,
  opts: { concurrency?: number; only?: string[]; onResult?: (r: CompanyResult) => void } = {},
) {
  const companies = await db.company.findMany({
    where: opts.only ? { slug: { in: opts.only } } : undefined,
    orderBy: { name: "asc" },
  });
  const limit = pLimit(opts.concurrency ?? 8);
  return Promise.all(
    companies.map((c) =>
      limit(async () => {
        const r = await scrapeCompany(db, c, ctx);
        opts.onResult?.(r);
        return r;
      }),
    ),
  );
}
