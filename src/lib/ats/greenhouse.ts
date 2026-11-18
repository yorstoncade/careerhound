import { finalize, htmlToText, toDate } from "../normalize";
import type { AtsAdapter } from "./types";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  content?: string;
  departments?: { name: string }[];
  metadata?: { name: string; value: unknown }[] | null;
}

export const greenhouse: AtsAdapter = {
  name: "greenhouse",
  url: (token) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  parse(raw) {
    const jobs = ((raw as { jobs?: GhJob[] }).jobs ?? []);
    return jobs.map((j) => {
      const remoteMeta = (j.metadata ?? []).some(
        (m) => /remote|workplace/i.test(m.name) && /remote/i.test(String(m.value ?? "")),
      );
      return finalize({
        externalId: String(j.id),
        title: j.title.trim(),
        department: j.departments?.[0]?.name ?? null,
        location: j.location?.name ?? "",
        remote: remoteMeta,
        employmentType: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        descriptionText: htmlToText(j.content),
        applyUrl: j.absolute_url,
        postedAt: toDate(j.first_published ?? j.updated_at),
      });
    });
  },
};
