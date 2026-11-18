export type AtsName = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";

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

export interface AtsAdapter {
  name: AtsName;
  /** Public JSON endpoint for a company's job board. */
  url(token: string): string;
  /** Turn the raw API response into normalized jobs. Pure, so it can be tested against fixtures. */
  parse(raw: unknown, token: string): NormalizedJob[];
}
