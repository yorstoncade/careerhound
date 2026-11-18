import * as cheerio from "cheerio";
import { finalize, htmlToText } from "../normalize";
import type { NormalizedJob } from "../ats/types";

export interface JobLink {
  url: string;
  title: string;
}

const JOBISH_PATH = /\/(jobs?|careers?|positions?|openings?|vacanc(y|ies)|roles?|opportunit(y|ies)|postings?|requisitions?|join-us)(\/|$|[-_])/i;
// Pages that commonly live under /careers but aren't job postings.
const NOT_JOB_SEGMENT = new Set([
  "jobs", "job", "careers", "career", "positions", "openings", "vacancies", "roles", "opportunities", "search",
  "benefits", "perks", "culture", "values", "teams", "team", "life", "students", "university", "early-careers",
  "faq", "faqs", "about", "locations", "departments", "how-we-hire", "hiring-process", "diversity", "internships",
  "login", "sign-in", "signin", "register", "alerts", "job-alerts", "saved", "privacy", "accessibility", "events",
]);
const NOT_TITLE =
  /^(apply( now)?|learn more|read more|more|details|view( all| more)?( jobs| roles| openings| positions| details| job| role)?|see (all|more)( jobs| roles| openings)?|all (jobs|openings|positions)|open (positions|roles)|careers?|jobs?|back|next|previous|home|search|join us|join our team|our team|benefits|culture|faq|sign in|log in|privacy( policy)?|cookies?)$/i;

const normalizeUrl = (u: URL) => {
  const c = new URL(u);
  c.hash = "";
  return c.toString().replace(/\/$/, "");
};

function siteKey(host: string) {
  return host.replace(/^www\./, "").split(".").slice(-2).join(".");
}

/** Links on a listing page that look like individual job postings. */
export function findJobLinks(html: string, pageUrl: string): JobLink[] {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const pageNorm = normalizeUrl(page);
  const seen = new Map<string, JobLink>();
  $("a[href]").each((_, el) => {
    const a = $(el);
    if (a.closest("nav, header, footer, [role=navigation]").length) return;
    const href = a.attr("href")!.trim();
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || siteKey(url.hostname) !== siteKey(page.hostname)) return;
    const norm = normalizeUrl(url);
    if (norm === pageNorm || pageNorm.startsWith(norm + "/")) return; // the listing itself or a parent
    if (!JOBISH_PATH.test(url.pathname)) return;
    const last = url.pathname.replace(/\/$/, "").split("/").pop()!.toLowerCase();
    if (NOT_JOB_SEGMENT.has(last)) return;
    // Filter links like ?department=engineering on the same listing page.
    if (url.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "") && url.search) return;

    const heading = a.find("h1, h2, h3, h4, h5, strong, [class*=title]").first().text();
    const text = (heading || a.text() || a.attr("title") || a.attr("aria-label") || "").replace(/\s+/g, " ").trim();
    if (text.length < 3 || text.length > 150 || NOT_TITLE.test(text)) return;
    if (!seen.has(norm)) seen.set(norm, { url: url.toString(), title: text });
  });
  return [...seen.values()];
}

/** The "next page" link of a paginated listing, if any. */
export function findNextPage(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const candidates = [
    $('link[rel="next"]').attr("href"),
    $('a[rel="next"]').attr("href"),
    $("a[aria-label]")
      .filter((_, el) => /^next( page)?$/i.test($(el).attr("aria-label")!.trim()))
      .first()
      .attr("href"),
    $("a")
      .filter((_, el) => /^(next( page)?|›|»|next ›|next »|>)$/i.test($(el).text().trim()))
      .first()
      .attr("href"),
  ];
  for (const href of candidates) {
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) continue;
    const next = new URL(href, pageUrl);
    if (normalizeUrl(next) !== normalizeUrl(new URL(pageUrl)) && next.hostname === new URL(pageUrl).hostname) {
      return next.toString();
    }
  }
  return null;
}

const MAX_DESCRIPTION = 20_000;

/** Best-effort job details from a page without structured data. Returns null if it doesn't look like a job. */
export function extractJobPage(html: string, url: string, fallbackTitle: string): NormalizedJob | null {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, form, iframe, svg").remove();
  const ogTitle = $('meta[property="og:title"]').attr("content")?.split(/\s+[|–—]\s+/)[0];
  const title = ($("h1").first().text() || ogTitle || fallbackTitle).replace(/\s+/g, " ").trim();
  if (!title || title.length > 150) return null;

  let location = "";
  $("dt, th, strong, b, span, label, div, li, p").each((_, el) => {
    if (location) return;
    const node = $(el);
    const text = node.text().replace(/\s+/g, " ").trim();
    const inline = text.match(/^(?:location|locations|office|based in|where)\s*[:\-–]\s*(.{2,100})$/i);
    if (inline) location = inline[1];
    else if (/^(location|locations|office)\s*:?$/i.test(text)) {
      const next = (node.next().text() || node.parent().next().text()).replace(/\s+/g, " ").trim();
      if (next && next.length <= 100) location = next;
    }
  });
  if (!location) {
    const cls = $('[class*="location" i], [itemprop="jobLocation"], [data-qa*="location" i]').first().text();
    if (cls && cls.length <= 100) location = cls.replace(/\s+/g, " ").trim();
  }

  const container =
    ['[itemprop="description"]', '[class*="description" i]', '[id*="description" i]', '[class*="job-content" i]', "article", "main"]
      .map((sel) => $(sel).first())
      .find((n) => n.length && n.text().trim().length > 200) ?? $("body");
  const descriptionText = htmlToText(container.html() ?? "").slice(0, MAX_DESCRIPTION);
  const pageText = $("body").text();
  // Posting pages mention applying somewhere; team/benefit pages usually don't.
  if (!/\bapply\b/i.test(pageText) && descriptionText.length < 300) return null;

  const u = new URL(url);
  return finalize({
    externalId: u.pathname.replace(/\/$/, "") + u.search,
    title,
    department: null,
    location,
    remote: false,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    descriptionText,
    applyUrl: url,
    postedAt: null,
  });
}
