import pLimit from "p-limit";
import { getAdapter, PLATFORM_LABELS } from "../ats";
import type { AtsAdapter, NormalizedJob, ScrapeContext, ScrapeMethod, ScrapeOutcome } from "../ats/types";
import { detectFromHtml, detectFromUrl, guessCompanyName, type Detected } from "./detect";
import { extractJobPostings, jsonLdOrganization } from "./jsonld";
import { extractJobPage, findJobLinks, findNextPage, type JobLink } from "./links";
import { createRobots } from "./robots";

const MAX_LISTING_PAGES = 5;
const MAX_JOB_PAGES = 150;
const MAX_RENDERED_JOB_PAGES = 40;
const THIN_DESCRIPTION = 200;

export interface CareersOutcome extends ScrapeOutcome {
  /** Company name suggested by the page (og:site_name, JSON-LD hiringOrganization, <title>). */
  nameHint?: string;
}

async function delegate(d: Detected, name: string, ctx: ScrapeContext): Promise<CareersOutcome> {
  try {
    const out = await getAdapter(d.ats).scrape({ token: d.token, name }, ctx);
    return { ...out, method: "platform", upgrade: d };
  } catch (e) {
    throw new Error(`Found a ${PLATFORM_LABELS[d.ats]} job board ("${d.token}") but couldn't load it: ${(e as Error).message}`);
  }
}

/**
 * Scrape any careers page URL:
 * 1. URL is a known platform board → that platform's API.
 * 2. Page embeds/links a known platform → that platform's API.
 * 3. JobPosting JSON-LD on the listing, or on each linked job page.
 * 4. HTML heuristics on linked job pages.
 * 5. If nothing was found, render the page in a headless browser and try 2–4 again.
 */
export async function scrapeCareersPage(url: string, name: string, ctx: ScrapeContext): Promise<CareersOutcome> {
  const direct = detectFromUrl(url);
  if (direct) return delegate(direct, name, ctx);

  const allowed = createRobots(ctx.http);
  if (!(await allowed(url))) throw new Error("This site's robots.txt doesn't allow automated access to that page");

  const html = await ctx.http.text(url);
  const nameHint = jsonLdOrganization(html) ?? guessCompanyName(html, url);
  const plain = await fromListing(html, url, name, ctx, allowed, false);
  if (plain.jobs.length || !ctx.render) return { ...plain, nameHint };

  const rendered = await ctx.render(url);
  const out = await fromListing(rendered, url, name, ctx, allowed, true);
  return { ...out, nameHint: jsonLdOrganization(rendered) ?? nameHint };
}

async function fromListing(
  html: string,
  url: string,
  name: string,
  ctx: ScrapeContext,
  allowed: (u: string) => Promise<boolean>,
  rendered: boolean,
): Promise<CareersOutcome> {
  const embedded = detectFromHtml(html);
  if (embedded) return delegate(embedded, name, ctx);

  // Walk paginated listings, collecting JSON-LD jobs and job links.
  const listingJobs: NormalizedJob[] = [];
  const links = new Map<string, JobLink>();
  let pageHtml = html;
  let pageUrl = url;
  for (let i = 0; i < MAX_LISTING_PAGES; i++) {
    listingJobs.push(...extractJobPostings(pageHtml, pageUrl));
    for (const l of findJobLinks(pageHtml, pageUrl)) if (!links.has(l.url)) links.set(l.url, l);
    const next = findNextPage(pageHtml, pageUrl);
    if (!next || !(await allowed(next))) break;
    try {
      pageHtml = rendered && ctx.render ? await ctx.render(next) : await ctx.http.text(next);
      pageUrl = next;
    } catch {
      break;
    }
  }
  const method: ScrapeMethod = rendered ? "rendered" : "json-ld";
  if (listingJobs.length) return { jobs: dedupe(listingJobs), method };

  const targets: JobLink[] = [];
  for (const l of [...links.values()].slice(0, MAX_JOB_PAGES)) if (await allowed(l.url)) targets.push(l);

  const limit = pLimit(4);
  let renderedPages = 0;
  const results = await Promise.all(
    targets.map((link) =>
      limit(async (): Promise<{ job: NormalizedJob; structured: boolean } | null> => {
        let page: string;
        try {
          page = await ctx.http.text(link.url);
        } catch {
          return null;
        }
        const structured = extractJobPostings(page, link.url)[0];
        if (structured) return { job: withLinkDefaults(structured, link), structured: true };
        let job = extractJobPage(page, link.url, link.title);
        // Job pages of JS-rendered sites are usually JS-rendered too.
        if (rendered && ctx.render && (!job || job.descriptionText.length < THIN_DESCRIPTION) && renderedPages < MAX_RENDERED_JOB_PAGES) {
          renderedPages++;
          const full = await ctx.render(link.url).catch(() => null);
          if (full) {
            const s = extractJobPostings(full, link.url)[0];
            if (s) return { job: withLinkDefaults(s, link), structured: true };
            job = extractJobPage(full, link.url, link.title) ?? job;
          }
        }
        return job ? { job, structured: false } : null;
      }),
    ),
  );
  let found = results.filter((r): r is { job: NormalizedJob; structured: boolean } => r !== null);
  const structuredCount = found.filter((r) => r.structured).length;
  // If most linked pages have structured job data, the ones without it probably aren't jobs.
  if (structuredCount && structuredCount >= found.length / 2) found = found.filter((r) => r.structured);
  return {
    jobs: dedupe(found.map((r) => r.job)),
    method: rendered ? "rendered" : structuredCount ? "json-ld" : "html",
  };
}

function withLinkDefaults(job: NormalizedJob, link: JobLink): NormalizedJob {
  // A job page's JSON-LD `url` sometimes points at the listing; the link we followed is more specific.
  const applyUrl = job.applyUrl && job.applyUrl !== link.url && !job.applyUrl.startsWith(link.url) ? job.applyUrl : link.url;
  return { ...job, applyUrl, externalId: job.externalId === job.applyUrl ? new URL(link.url).pathname : job.externalId };
}

function dedupe(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();
  for (const j of jobs) if (!seen.has(j.externalId)) seen.set(j.externalId, j);
  return [...seen.values()];
}

export const careersPage: AtsAdapter = {
  name: "careers-page",
  scrape: (company, ctx) => scrapeCareersPage(company.token, company.name, ctx),
};
