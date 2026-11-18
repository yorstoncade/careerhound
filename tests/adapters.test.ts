import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { platformAdapters as adapters } from "@/lib/ats";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", `${name}.json`), "utf8"));

describe("greenhouse", () => {
  const jobs = adapters.greenhouse.parse(fixture("greenhouse"), "acme");
  it("decodes double-encoded HTML and extracts salary from text", () => {
    const j = jobs[0];
    expect(j).toMatchObject({
      externalId: "7012345",
      title: "Senior Backend Engineer",
      department: "Engineering",
      location: "New York, NY",
      remote: false,
      seniority: "Senior",
      salaryMin: 160000,
      salaryMax: 200000,
      salaryCurrency: "USD",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/7012345",
    });
    expect(j.descriptionText).toContain("Build & scale our APIs.");
    expect(j.descriptionText).toContain("• Go & Postgres");
    expect(j.postedAt?.toISOString()).toBe("2026-11-01T14:30:00.000Z");
  });
  it("reads remote from metadata and ignores hourly pay", () => {
    expect(jobs[1]).toMatchObject({ remote: true, department: null, salaryMin: null });
  });
});

describe("lever", () => {
  const jobs = adapters.lever.parse(fixture("lever"), "acme");
  it("uses structured salary, all locations and lists", () => {
    expect(jobs[0]).toMatchObject({
      title: "Product Designer",
      department: "Design",
      location: "Remote - US · Toronto",
      remote: true,
      employmentType: "Full-time",
      salaryMin: 130000,
      salaryMax: 165000,
      salaryCurrency: "USD",
    });
    expect(jobs[0].descriptionText).toContain("Requirements\n• 4+ years of product design");
  });
  it("ignores hourly salary ranges and falls back to team", () => {
    expect(jobs[1]).toMatchObject({ department: "Operations", salaryMin: null, remote: false });
  });
});

describe("ashby", () => {
  const jobs = adapters.ashby.parse(fixture("ashby"), "acme");
  it("skips unlisted jobs", () => {
    expect(jobs.map((j) => j.title)).not.toContain("Unlisted Role");
    expect(jobs).toHaveLength(2);
  });
  it("picks the yearly salary component and joins locations", () => {
    expect(jobs[0]).toMatchObject({
      seniority: "Staff",
      location: "San Francisco · Seattle",
      employmentType: "Full-time",
      salaryMin: 250000,
      salaryMax: 320000,
      salaryCurrency: "USD",
    });
  });
  it("falls back to HTML description and parses GBP k ranges", () => {
    expect(jobs[1]).toMatchObject({ remote: true, salaryMin: 120000, salaryMax: 150000, salaryCurrency: "GBP" });
    expect(jobs[1].descriptionText).toBe("Close deals. OTE £120k–£150k.");
  });
});

describe("workable", () => {
  it("parses locations and euro salary", () => {
    const [j] = adapters.workable.parse(fixture("workable"), "acme");
    expect(j).toMatchObject({
      externalId: "AB12CD34EF",
      location: "Berlin, Berlin, Germany",
      seniority: "Junior",
      salaryMin: 50000,
      salaryMax: 60000,
      salaryCurrency: "EUR",
    });
  });
});

describe("smartrecruiters", () => {
  it("builds the public job URL and location", () => {
    const [j] = adapters.smartrecruiters.parse(fixture("smartrecruiters"), "acme");
    expect(j).toMatchObject({
      title: "Director of Finance",
      location: "Austin, TX, US",
      seniority: "Director",
      department: "Finance",
      applyUrl: "https://jobs.smartrecruiters.com/AcmeCorp/744000012345678",
    });
  });
});

describe("all adapters", () => {
  it("return empty arrays for unexpected payloads", () => {
    for (const a of [adapters.greenhouse, adapters.lever, adapters.ashby, adapters.workable, adapters.smartrecruiters]) {
      expect(a.parse({}, "x")).toEqual([]);
      expect(a.parse({ jobs: null, content: null }, "x")).toEqual([]);
    }
  });
});
