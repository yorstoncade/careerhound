import { finalize, htmlToText, toDate } from "../normalize";
import type { AtsAdapter } from "./types";

interface WorkableJob {
  title: string;
  shortcode: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url?: string;
  shortlink?: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  country?: string;
  city?: string;
  state?: string;
  description?: string;
  locations?: { country?: string; city?: string; region?: string; hidden?: boolean }[];
}

function place(p: { city?: string; region?: string; state?: string; country?: string }) {
  return [p.city, p.region ?? p.state, p.country].filter(Boolean).join(", ");
}

export const workable: AtsAdapter = {
  name: "workable",
  url: (token) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`,
  parse(raw, token) {
    const jobs = ((raw as { jobs?: WorkableJob[] }).jobs ?? []);
    return jobs.map((j) => {
      const locs = (j.locations ?? []).filter((l) => !l.hidden).map(place).filter(Boolean);
      return finalize({
        externalId: j.shortcode,
        title: j.title.trim(),
        department: j.department || null,
        location: locs.length ? locs.join(" · ") : place(j),
        remote: !!j.telecommuting,
        employmentType: j.employment_type || null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        descriptionText: htmlToText(j.description),
        applyUrl: j.url ?? j.shortlink ?? `https://apply.workable.com/${token}/j/${j.shortcode}/`,
        postedAt: toDate(j.published_on ?? j.created_at),
      });
    });
  },
};
