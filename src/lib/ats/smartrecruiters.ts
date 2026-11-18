import { finalize, toDate } from "../normalize";
import { jsonAdapter } from "./types";

interface SrJob {
  id: string;
  name: string;
  releasedDate?: string;
  company?: { identifier?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
}

export const smartrecruiters = jsonAdapter({
  name: "smartrecruiters",
  url: (token) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`,
  parse(raw, token) {
    const jobs = ((raw as { content?: SrJob[] }).content ?? []);
    return jobs.map((j) => {
      const l = j.location ?? {};
      const company = j.company?.identifier ?? token;
      return finalize({
        externalId: j.id,
        title: j.name.trim(),
        department: j.department?.label ?? j.function?.label ?? null,
        location: l.fullLocation ?? [l.city, l.region, l.country?.toUpperCase()].filter(Boolean).join(", "),
        remote: !!l.remote,
        employmentType: j.typeOfEmployment?.label ?? null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        // The listing endpoint has no description; the full text lives on the job page.
        descriptionText: [j.experienceLevel?.label, j.function?.label].filter(Boolean).join(" · "),
        applyUrl: `https://jobs.smartrecruiters.com/${company}/${j.id}`,
        postedAt: toDate(j.releasedDate),
      });
    });
  },
});
