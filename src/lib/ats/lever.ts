import { finalize, htmlToText, toDate } from "../normalize";
import { jsonAdapter } from "./types";

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { commitment?: string; department?: string; team?: string; location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export const lever = jsonAdapter({
  name: "lever",
  url: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
  parse(raw) {
    const jobs = Array.isArray(raw) ? (raw as LeverJob[]) : [];
    return jobs.map((j) => {
      const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
      const desc = [j.descriptionPlain ?? htmlToText(j.description), lists, j.additionalPlain]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      const sr = j.salaryRange;
      const yearly = sr && (!sr.interval || /year|annual/i.test(sr.interval));
      const locs = j.categories?.allLocations?.length ? j.categories.allLocations.join(" · ") : j.categories?.location;
      return finalize({
        externalId: j.id,
        title: j.text.trim(),
        department: j.categories?.department ?? j.categories?.team ?? null,
        location: locs ?? "",
        remote: j.workplaceType === "remote",
        employmentType: j.categories?.commitment ?? null,
        salaryMin: yearly ? (sr.min ?? null) : null,
        salaryMax: yearly ? (sr.max ?? null) : null,
        salaryCurrency: yearly ? (sr.currency ?? null) : null,
        descriptionText: desc,
        applyUrl: j.hostedUrl,
        postedAt: toDate(j.createdAt),
      });
    });
  },
});
