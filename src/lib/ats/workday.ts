import pLimit from "p-limit";
import { finalize, htmlToText, toDate } from "../normalize";
import type { AtsAdapter, NormalizedJob } from "./types";

/**
 * Workday career sites (`{tenant}.wd5.myworkdayjobs.com/{site}`) are backed by a public JSON API.
 * Token format: `{tenant}.{wdN}/{site}`, e.g. `acme.wd5/External`.
 */

export interface WorkdayListItem {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  remoteType?: string;
  bulletFields?: string[];
}
export interface WorkdayDetail {
  jobPostingInfo?: {
    id?: string;
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    timeType?: string;
    startDate?: string;
    postedOn?: string;
    jobReqId?: string;
    externalUrl?: string;
    remoteType?: string;
  };
}

const PAGE_SIZE = 20;
const MAX_JOBS = 1000;
const MAX_DETAILS = 200;

export function parseWorkdayToken(token: string) {
  const m = token.match(/^([a-z0-9-]+)\.(wd\d+)\/([^/?#]+)$/i);
  if (!m) throw new Error(`Invalid Workday token "${token}" (expected tenant.wdN/site)`);
  const [, tenant, dc, site] = m;
  const origin = `https://${tenant}.${dc}.myworkdayjobs.com`;
  return { tenant, site, origin, api: `${origin}/wday/cxs/${tenant}/${site}` };
}

/** "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago" → a date. */
export function parsePostedOn(text: string | undefined, now = new Date()): Date | null {
  if (!text) return null;
  const day = 864e5;
  if (/today/i.test(text)) return now;
  if (/yesterday/i.test(text)) return new Date(now.getTime() - day);
  const m = text.match(/(\d+)\+?\s*days?/i);
  return m ? new Date(now.getTime() - Number(m[1]) * day) : null;
}

export function parseWorkdayJob(
  token: string,
  item: WorkdayListItem,
  detail?: WorkdayDetail,
  now = new Date(),
): NormalizedJob {
  const { origin, site } = parseWorkdayToken(token);
  const info = detail?.jobPostingInfo ?? {};
  const locations = [info.location ?? item.locationsText, ...(info.additionalLocations ?? [])].filter(Boolean);
  const remoteType = info.remoteType ?? item.remoteType;
  return finalize({
    externalId: info.jobReqId ?? item.bulletFields?.[0] ?? item.externalPath,
    title: (info.title ?? item.title).trim(),
    department: null,
    location: locations.join(" · "),
    remote: !!remoteType && /remote/i.test(remoteType),
    employmentType: info.timeType ?? null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    descriptionText: htmlToText(info.jobDescription),
    applyUrl: info.externalUrl ?? `${origin}/${site}${item.externalPath}`,
    postedAt: toDate(info.startDate) ?? parsePostedOn(info.postedOn ?? item.postedOn, now),
  });
}

export const workday: AtsAdapter & { careersUrl(token: string): string } = {
  name: "workday",
  careersUrl(token) {
    const { origin, site } = parseWorkdayToken(token);
    return `${origin}/${site}`;
  },
  async scrape(company, { http }) {
    const { api } = parseWorkdayToken(company.token);
    const items: WorkdayListItem[] = [];
    let total = Infinity;
    for (let offset = 0; offset < Math.min(total, MAX_JOBS); offset += PAGE_SIZE) {
      const page = (await http.json(`${api}/jobs`, {
        method: "POST",
        body: { appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: "" },
      })) as { total?: number; jobPostings?: WorkdayListItem[] };
      // Workday only reports the total on the first page.
      if (offset === 0) total = page.total ?? 0;
      const postings = page.jobPostings ?? [];
      items.push(...postings);
      if (postings.length < PAGE_SIZE) break;
    }
    const limit = pLimit(4);
    const jobs = await Promise.all(
      items.map((item, i) =>
        limit(async () => {
          let detail: WorkdayDetail | undefined;
          if (i < MAX_DETAILS) detail = (await http.json(`${api}${item.externalPath}`).catch(() => undefined)) as WorkdayDetail;
          return parseWorkdayJob(company.token, item, detail);
        }),
      ),
    );
    return { jobs, method: "platform" };
  },
};
