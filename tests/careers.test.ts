import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePostedOn, parseWorkdayJob, parseWorkdayToken, workday } from "@/lib/ats/workday";
import { detectFromHtml, detectFromUrl, guessCompanyName } from "@/lib/careers/detect";
import { extractJobPostings } from "@/lib/careers/jsonld";
import { extractJobPage, findJobLinks, findNextPage } from "@/lib/careers/links";
import { isAllowed, parseRobots } from "@/lib/careers/robots";
import { assertPublicUrl, isPrivateAddress, type Http } from "@/lib/http";
import { PAGES } from "./fixtures/careers/site";

const BASE = "https://acme.example.com";
const page = (p: string) => PAGES[p] as string;

describe("detectFromUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/stripe", "greenhouse", "stripe"],
    ["https://job-boards.greenhouse.io/figma/jobs/123", "greenhouse", "figma"],
    ["https://jobs.lever.co/plaid/abc-123", "lever", "plaid"],
    ["https://jobs.ashbyhq.com/ramp", "ashby", "ramp"],
    ["https://apply.workable.com/acme-inc/j/ABC123/", "workable", "acme-inc"],
    ["https://jobs.smartrecruiters.com/Visa/744000", "smartrecruiters", "Visa"],
    ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite", "workday", "nvidia.wd5/NVIDIAExternalCareerSite"],
    ["https://acme.wd1.myworkdayjobs.com/en-US/External/job/Austin/Engineer_R123", "workday", "acme.wd1/External"],
  ])("%s", (url, ats, token) => expect(detectFromUrl(url)).toEqual({ ats, token }));

  it("returns null for ordinary sites", () => {
    expect(detectFromUrl("https://acme.com/careers")).toBeNull();
    expect(detectFromUrl("https://boards.greenhouse.io/embed/job_board")).toBeNull();
  });
});

describe("detectFromHtml", () => {
  it("finds an embedded Greenhouse board", () => {
    expect(detectFromHtml(page("/gamma/careers"))).toEqual({ ats: "greenhouse", token: "gammaco" });
  });
  it("finds a Workday iframe and picks the most-referenced board", () => {
    const html = `<iframe src="https://acme.wd3.myworkdayjobs.com/en-US/Careers"></iframe>
      <a href="https://acme.wd3.myworkdayjobs.com/Careers/job/x">Job</a>
      <a href="https://jobs.lever.co/someone-else">Partner</a>`;
    expect(detectFromHtml(html)).toEqual({ ats: "workday", token: "acme.wd3/Careers" });
  });
  it("returns null for plain pages", () => expect(detectFromHtml(page("/beta/careers"))).toBeNull());
});

describe("guessCompanyName", () => {
  it("prefers og:site_name, then a title, then the domain", () => {
    expect(guessCompanyName(page("/acme/careers"), BASE)).toBe("Acme Rockets");
    expect(guessCompanyName("<title>Careers | Globex</title>", BASE)).toBe("Globex");
    expect(guessCompanyName("<title>Jobs at Initech</title>", BASE)).toBe("Initech");
    expect(guessCompanyName("<title>Join Beta Labs</title>", BASE)).toBe("Beta Labs");
    expect(guessCompanyName("<title>Careers</title>", "https://careers.hooli.com/open")).toBe("Hooli");
    expect(guessCompanyName(null, "http://127.0.0.1:4400/x")).toBe("127.0.0.1:4400");
  });
});

describe("extractJobPostings (JSON-LD)", () => {
  it("maps a full JobPosting", () => {
    const [j] = extractJobPostings(page("/acme/jobs/101"), `${BASE}/acme/jobs/101`);
    expect(j).toMatchObject({
      externalId: "ACME-101",
      title: "Senior Backend Engineer",
      location: "Denver, CO, US",
      remote: false,
      employmentType: "Full-time",
      seniority: "Senior",
      salaryMin: 150000,
      salaryMax: 190000,
      salaryCurrency: "USD",
      applyUrl: `${BASE}/acme/jobs/101`,
    });
    expect(j.descriptionText).toBe("Build our APIs.\n\n• Go\n• Postgres");
    expect(j.postedAt?.toISOString().slice(0, 10)).toBe("2026-11-10");
  });
  it("reads @graph, remote-only jobs and escaped HTML", () => {
    const [j] = extractJobPostings(page("/acme/jobs/102"), `${BASE}/acme/jobs/102`);
    expect(j).toMatchObject({ title: "Product Designer", remote: true, location: "Remote - USA" });
    expect(j.descriptionText).toBe("Design things people love.");
  });
  it("handles multiple locations and ignores hourly pay", () => {
    const [j] = extractJobPostings(page("/acme/jobs/103"), `${BASE}/acme/jobs/103`);
    expect(j).toMatchObject({ location: "Austin, TX · Remote", remote: true, salaryMin: null });
  });
  it("reads ItemList listings and tolerates raw newlines in JSON", () => {
    const html = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[
      {"@type":"ListItem","item":{"@type":"JobPosting","title":"Chef","description":"Cook
      food","url":"/jobs/chef"}},
      {"@type":"ListItem","item":{"@type":"JobPosting","title":"Host"}}]}</script>`;
    const jobs = extractJobPostings(html, `${BASE}/careers`);
    expect(jobs.map((j) => j.title)).toEqual(["Chef", "Host"]);
    expect(jobs[0].applyUrl).toBe(`${BASE}/jobs/chef`);
  });
});

describe("findJobLinks", () => {
  it("finds postings and skips nav, footer, filters, apply buttons and other sites", () => {
    const links = findJobLinks(page("/acme/careers"), `${BASE}/acme/careers`);
    expect(links).toEqual([
      { url: `${BASE}/acme/jobs/101`, title: "Senior Backend Engineer" },
      { url: `${BASE}/acme/jobs/102`, title: "Product Designer" },
    ]);
  });
  it("skips well-known non-job pages", () => {
    const titles = findJobLinks(page("/beta/careers"), `${BASE}/beta/careers`).map((l) => l.title);
    expect(titles).toEqual(["Senior Designer", "Data Engineer II", "Life at Beta"]);
  });
  it("finds the next page", () => {
    expect(findNextPage(page("/acme/careers"), `${BASE}/acme/careers`)).toBe(`${BASE}/acme/careers?page=2`);
    expect(findNextPage(page("/beta/careers"), `${BASE}/beta/careers`)).toBeNull();
  });
});

describe("extractJobPage (no structured data)", () => {
  it("reads title, labelled location, description and salary", () => {
    const j = extractJobPage(page("/beta/careers/senior-designer"), `${BASE}/beta/careers/senior-designer`, "x")!;
    expect(j).toMatchObject({ title: "Senior Designer", location: "London, UK", seniority: "Senior", salaryMin: 70000, salaryCurrency: "GBP" });
    expect(j.descriptionText).toContain("5+ years experience");
    expect(j.descriptionText).not.toContain("Benefits"); // nav removed
  });
  it("reads a dt/dd location", () => {
    const j = extractJobPage(page("/beta/careers/data-engineer-ii"), `${BASE}/beta/careers/data-engineer-ii`, "x")!;
    expect(j).toMatchObject({ title: "Data Engineer II", location: "Remote (Europe)", remote: true });
  });
  it("rejects pages that aren't job postings", () => {
    expect(extractJobPage(page("/beta/careers/life-at-beta"), `${BASE}/beta/careers/life-at-beta`, "Life")).toBeNull();
  });
});

describe("robots.txt", () => {
  const groups = parseRobots(`# comment
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private
Disallow: /*.pdf$
Allow: /private/careers

User-agent: JobScout
Disallow: /no-scouts`);
  it("uses our own group when present", () => {
    expect(isAllowed(groups, "/no-scouts/x")).toBe(false);
    expect(isAllowed(groups, "/private")).toBe(true);
  });
  it("falls back to * with longest-match and wildcards", () => {
    const star = parseRobots("User-agent: *\nDisallow: /private\nDisallow: /*.pdf$\nAllow: /private/careers");
    expect(isAllowed(star, "/private/x")).toBe(false);
    expect(isAllowed(star, "/private/careers/1")).toBe(true);
    expect(isAllowed(star, "/files/a.pdf")).toBe(false);
    expect(isAllowed(star, "/files/a.pdf?x")).toBe(true);
    expect(isAllowed([], "/anything")).toBe(true);
  });
});

describe("workday", () => {
  const listFixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/workday-list.json"), "utf8"));
  const detailFixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/workday-detail.json"), "utf8"));
  const now = new Date("2026-11-18T12:00:00Z");

  it("parses tokens and posted dates", () => {
    expect(parseWorkdayToken("acme.wd5/External").api).toBe("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External");
    expect(() => parseWorkdayToken("nope")).toThrow();
    expect(parsePostedOn("Posted Today", now)).toEqual(now);
    expect(parsePostedOn("Posted Yesterday", now)?.toISOString()).toBe("2026-11-17T12:00:00.000Z");
    expect(parsePostedOn("Posted 30+ Days Ago", now)?.toISOString()).toBe("2026-10-19T12:00:00.000Z");
  });

  it("combines list and detail data", () => {
    const j = parseWorkdayJob("acme.wd5/External", listFixture.jobPostings[0], detailFixture, now);
    expect(j).toMatchObject({
      externalId: "R0012345",
      title: "Senior Software Engineer",
      location: "Austin, TX · Remote, USA",
      remote: true,
      employmentType: "Full time",
      seniority: "Senior",
      salaryMin: 140000,
      salaryMax: 180000,
      applyUrl: "https://acme.wd5.myworkdayjobs.com/External/job/Austin-TX/Senior-Software-Engineer_R0012345",
    });
    expect(j.postedAt?.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("pages through the list API and fetches details", async () => {
    const calls: string[] = [];
    const http: Http = {
      async json(url, init) {
        calls.push(`${init?.method ?? "GET"} ${url.replace("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External", "")}`);
        if (url.endsWith("/jobs")) {
          const offset = (init?.body as { offset: number }).offset;
          // 25 jobs: a full page of 20, then 5. Total only reported on the first page, like Workday.
          const n = offset === 0 ? 20 : 5;
          return {
            total: offset === 0 ? 25 : 0,
            jobPostings: Array.from({ length: n }, (_, i) => ({
              ...listFixture.jobPostings[1],
              externalPath: `/job/x/Job_${offset + i}`,
              bulletFields: [`R${offset + i}`],
            })),
          };
        }
        return { jobPostingInfo: { jobDescription: "<p>Details</p>" } };
      },
      text: async () => "",
    };
    const out = await workday.scrape({ token: "acme.wd5/External", name: "Acme" }, { http });
    expect(out.jobs).toHaveLength(25);
    expect(new Set(out.jobs.map((j) => j.externalId)).size).toBe(25);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(2);
    expect(out.jobs[0].descriptionText).toBe("Details");
  });
});

describe("URL safety", () => {
  it("classifies private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("rejects private and non-http URLs", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:3000/x")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow(/http/);
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/valid/);
  });
});
