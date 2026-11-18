import type { Http } from "../http";

/** Platforms with a public JSON job-board API. */
export type PlatformName = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "workday";
/** `careers-page` is any other careers URL, scraped from its HTML. */
export type AtsName = PlatformName | "careers-page";

export interface NormalizedJob {
  externalId: string;
  title: string;
  department: string | null;
  location: string;
  remote: boolean;
  employmentType: string | null;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionText: string;
  applyUrl: string;
  postedAt: Date | null;
}

/** Renders a page in a headless browser and returns the resulting HTML. */
export type RenderFn = (url: string) => Promise<string>;

export interface ScrapeContext {
  http: Http;
  /** Headless-browser renderer; absent when JavaScript rendering isn't available. */
  render?: RenderFn;
}

export type ScrapeMethod = "platform" | "json-ld" | "html" | "rendered";

export interface ScrapeOutcome {
  jobs: NormalizedJob[];
  method: ScrapeMethod;
  /** Set when a careers page turned out to be hosted on a known platform. */
  upgrade?: { ats: PlatformName; token: string };
}

export interface AtsAdapter {
  name: AtsName;
  scrape(company: { token: string; name: string }, ctx: ScrapeContext): Promise<ScrapeOutcome>;
}

/** A platform whose whole board comes from one JSON request. */
export interface JsonAdapter extends AtsAdapter {
  /** Public JSON endpoint for a company's job board. */
  url(token: string): string;
  /** Turn the raw API response into normalized jobs. Pure, so it can be tested against fixtures. */
  parse(raw: unknown, token: string): NormalizedJob[];
}

export function jsonAdapter(a: Pick<JsonAdapter, "url" | "parse"> & { name: PlatformName }): JsonAdapter {
  return {
    ...a,
    async scrape(company, ctx) {
      return { jobs: a.parse(await ctx.http.json(a.url(company.token)), company.token), method: "platform" };
    },
  };
}
