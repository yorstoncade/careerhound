import * as cheerio from "cheerio";
import type { PlatformName } from "../ats/types";

export interface Detected {
  ats: PlatformName;
  token: string;
}

const T = "([A-Za-z0-9][A-Za-z0-9_.-]*)";
// Path segments that are part of a platform's own URLs, not a company's board token.
const NOT_TOKENS = new Set(["embed", "api", "j", "v0", "v1", "posting-api", "wday", "static", "assets", "js", "css"]);

const PATTERNS: { ats: PlatformName; re: RegExp; token: (m: RegExpMatchArray) => string }[] = [
  { ats: "greenhouse", re: new RegExp(`boards-api\\.greenhouse\\.io/v1/boards/${T}`, "gi"), token: (m) => m[1] },
  { ats: "greenhouse", re: new RegExp(`greenhouse\\.io/embed/job_board(?:/js)?\\?(?:[^"'\\s]*&(?:amp;)?)?for=${T}`, "gi"), token: (m) => m[1] },
  { ats: "greenhouse", re: new RegExp(`(?:job-)?boards(?:\\.eu)?\\.greenhouse\\.io/${T}`, "gi"), token: (m) => m[1] },
  { ats: "lever", re: new RegExp(`api\\.lever\\.co/v0/postings/${T}`, "gi"), token: (m) => m[1] },
  { ats: "lever", re: new RegExp(`jobs\\.lever\\.co/${T}`, "gi"), token: (m) => m[1] },
  { ats: "ashby", re: new RegExp(`api\\.ashbyhq\\.com/posting-api/job-board/${T}`, "gi"), token: (m) => m[1] },
  { ats: "ashby", re: new RegExp(`jobs\\.ashbyhq\\.com/${T}`, "gi"), token: (m) => m[1] },
  { ats: "workable", re: new RegExp(`apply\\.workable\\.com/(?:api/v\\d/widget/accounts/)?${T}`, "gi"), token: (m) => m[1] },
  { ats: "smartrecruiters", re: new RegExp(`api\\.smartrecruiters\\.com/v1/companies/${T}`, "gi"), token: (m) => m[1] },
  { ats: "smartrecruiters", re: new RegExp(`(?:jobs|careers)\\.smartrecruiters\\.com/${T}`, "gi"), token: (m) => m[1] },
  {
    ats: "workday",
    re: /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9-]+\/)?(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/g,
    token: (m) => `${m[1]}.${m[2]}/${m[3]}`,
  },
];

function clean(token: string) {
  return token.replace(/[.\-_]+$/, "");
}

function matches(text: string): Detected[] {
  const out: Detected[] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const token = clean(p.token(m));
      const last = token.split("/").pop()!.toLowerCase();
      if (!token || NOT_TOKENS.has(last) || NOT_TOKENS.has(token.toLowerCase())) continue;
      out.push({ ats: p.ats, token });
    }
  }
  return out;
}

/** Is this URL itself a known job platform's board? */
export function detectFromUrl(url: string): Detected | null {
  return matches(url)[0] ?? null;
}

/**
 * Does this page embed or link to a known job platform? Picks the board referenced most often,
 * so a stray link to some other company's board doesn't win.
 */
export function detectFromHtml(html: string): Detected | null {
  const counts = new Map<string, { d: Detected; n: number }>();
  for (const d of matches(html)) {
    const key = `${d.ats}:${d.token.toLowerCase()}`;
    const e = counts.get(key) ?? { d, n: 0 };
    e.n++;
    counts.set(key, e);
  }
  let best: { d: Detected; n: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return best?.d ?? null;
}

/** A sensible company name from a careers page: og:site_name, then <title>, then the domain. */
export function guessCompanyName(html: string | null, url: string): string {
  if (html) {
    const $ = cheerio.load(html);
    const site = $('meta[property="og:site_name"]').attr("content")?.trim();
    if (site) return site;
    const title = $("title").first().text().trim();
    if (title) {
      // "Careers at Acme", "Acme | Careers", "Join Beta Labs", "Jobs - Acme Inc"
      const generic = /^(careers?|jobs?|join us|work with us|open (roles|positions)|openings?|positions?|we're hiring|hiring)$/i;
      for (const part of title.split(/\s+[|–—\-·:]\s+/)) {
        const name = part
          .trim()
          .replace(/^(join( us at| the team at)?|careers? at|jobs? at|work(ing)? (at|with)|life at)\s+/i, "")
          .replace(/\s+(careers?|jobs?|job board|openings)$/i, "")
          .trim();
        if (name && !generic.test(name) && name.length <= 60) return name;
      }
    }
  }
  return nameFromHost(url);
}

export function nameFromHost(url: string): string {
  const { hostname, host: hostWithPort } = new URL(url);
  if (/^[\d.]+$|:/.test(hostname)) return hostWithPort; // an IP address has no name to offer
  const host = hostname.replace(/^(www|careers|jobs|work|join)\./, "");
  const base = host.split(".").slice(-2, -1)[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function nameFromToken(d: Detected): string {
  const raw = d.ats === "workday" ? d.token.split(".")[0] : d.token;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
