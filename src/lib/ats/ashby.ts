import { finalize, htmlToText, toDate } from "../normalize";
import { jsonAdapter } from "./types";

interface AshbyComp {
  compensationType?: string;
  interval?: string;
  currencyCode?: string;
  minValue?: number | null;
  maxValue?: number | null;
}
interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  isListed?: boolean;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  jobUrl: string;
  compensation?: { summaryComponents?: AshbyComp[] };
}

const EMPLOYMENT: Record<string, string> = {
  FullTime: "Full-time", PartTime: "Part-time", Intern: "Internship", Contract: "Contract", Temporary: "Temporary",
};

export const ashby = jsonAdapter({
  name: "ashby",
  url: (token) =>
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
  parse(raw) {
    const jobs = ((raw as { jobs?: AshbyJob[] }).jobs ?? []).filter((j) => j.isListed !== false);
    return jobs.map((j) => {
      const salary = j.compensation?.summaryComponents?.find(
        (c) => c.compensationType === "Salary" && (!c.interval || /year/i.test(c.interval)),
      );
      const locations = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean);
      return finalize({
        externalId: j.id,
        title: j.title.trim(),
        department: j.department ?? j.team ?? null,
        location: locations.join(" · "),
        remote: !!j.isRemote || j.workplaceType === "Remote",
        employmentType: j.employmentType ? (EMPLOYMENT[j.employmentType] ?? j.employmentType) : null,
        salaryMin: salary?.minValue ?? null,
        salaryMax: salary?.maxValue ?? null,
        salaryCurrency: salary?.currencyCode ?? null,
        descriptionText: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml),
        applyUrl: j.jobUrl,
        postedAt: toDate(j.publishedAt),
      });
    });
  },
});
