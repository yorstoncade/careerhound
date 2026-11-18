import type { Company, PrismaClient } from "@prisma/client";
import { getAdapter, PLATFORM_LABELS, type AtsName, type ScrapeContext } from "../ats";
import { assertPublicUrl } from "../http";
import { saveJobs } from "../scraper";
import { scrapeCareersPage } from "./careersPage";
import { detectFromUrl, nameFromHost, nameFromToken } from "./detect";

export class AddCompanyError extends Error {}

export interface AddCompanyResult {
  company: Company;
  existed: boolean;
  found: number;
  via: string;
  method: string;
  sample: string[];
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

async function uniqueSlug(db: PrismaClient, name: string) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await db.company.findUnique({ where: { slug } }))) return slug;
  }
}

/** Normalize a careers URL so the same page isn't added twice (drop #hash and a trailing slash). */
export function normalizeCareersUrl(url: URL): string {
  const u = new URL(url);
  u.hash = "";
  return u.toString().replace(/\/(?=$|\?)/, "");
}

/**
 * Add a company from any careers URL: detect its job platform (or treat it as a plain careers page),
 * scrape it once, and save it only if jobs were found.
 */
export async function addCompanyFromUrl(
  db: PrismaClient,
  rawUrl: string,
  opts: { name?: string; ctx: ScrapeContext },
): Promise<AddCompanyResult> {
  const input = rawUrl.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  try {
    return await addFromUrl(db, hasScheme ? input : `https://${input}`, opts);
  } catch (e) {
    // "acme.com/careers" was typed without a scheme; if https didn't work, try plain http.
    if (!hasScheme && e instanceof AddCompanyError && /couldn't read/i.test(e.message)) {
      return addFromUrl(db, `http://${input}`, opts);
    }
    throw e;
  }
}

async function addFromUrl(
  db: PrismaClient,
  rawUrl: string,
  opts: { name?: string; ctx: ScrapeContext },
): Promise<AddCompanyResult> {
  let url: URL;
  try {
    url = await assertPublicUrl(rawUrl);
  } catch (e) {
    throw new AddCompanyError((e as Error).message);
  }
  const careersUrl = normalizeCareersUrl(url);
  const direct = detectFromUrl(careersUrl);
  let ats: AtsName = direct?.ats ?? "careers-page";
  let token = direct?.token ?? careersUrl;

  const existing =
    (await db.company.findUnique({ where: { ats_token: { ats, token } } })) ??
    (await db.company.findFirst({ where: { careersUrl } }));
  if (existing) return existingResult(db, existing);

  const name = opts.name?.trim();
  let outcome;
  try {
    outcome =
      ats === "careers-page"
        ? await scrapeCareersPage(careersUrl, name ?? "", opts.ctx)
        : await getAdapter(ats).scrape({ token, name: name ?? "" }, opts.ctx);
  } catch (e) {
    throw new AddCompanyError(`Couldn't read that page: ${(e as Error).message}`);
  }
  if (outcome.upgrade) {
    ({ ats, token } = outcome.upgrade);
    const dup = await db.company.findUnique({ where: { ats_token: { ats, token } } });
    if (dup) return existingResult(db, dup);
  }
  if (!outcome.jobs.length) {
    throw new AddCompanyError(
      "No jobs found on that page. Try the page that lists all open positions, or a single job's page.",
    );
  }

  const finalName =
    name ||
    ("nameHint" in outcome && typeof outcome.nameHint === "string" ? outcome.nameHint : undefined) ||
    (direct ? nameFromToken(direct) : outcome.upgrade ? nameFromToken(outcome.upgrade) : nameFromHost(careersUrl));
  const company = await db.company.create({
    data: {
      name: finalName.slice(0, 100),
      slug: await uniqueSlug(db, finalName),
      ats,
      token,
      careersUrl,
      website: url.origin,
      scrapeMethod: outcome.method,
      lastScrapedAt: new Date(),
    },
  });
  const saved = await saveJobs(db, company.id, outcome.jobs);
  return {
    company,
    existed: false,
    found: saved.found,
    via: PLATFORM_LABELS[ats],
    method: outcome.method,
    sample: outcome.jobs.slice(0, 3).map((j) => j.title),
  };
}

async function existingResult(db: PrismaClient, company: Company): Promise<AddCompanyResult> {
  const jobs = await db.job.findMany({ where: { companyId: company.id, isActive: true }, select: { title: true } });
  return {
    company,
    existed: true,
    found: jobs.length,
    via: PLATFORM_LABELS[company.ats as AtsName] ?? company.ats,
    method: company.scrapeMethod ?? "platform",
    sample: jobs.slice(0, 3).map((j) => j.title),
  };
}
