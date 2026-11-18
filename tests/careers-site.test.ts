/**
 * End-to-end scraping of the fixture careers sites over real HTTP, including a real headless
 * browser for the JavaScript-only site.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scrapeCareersPage } from "@/lib/careers/careersPage";
import { createRenderer } from "@/lib/careers/render";
import { createHttp, type Http } from "@/lib/http";
import { startFixtureSite } from "./fixtures/careers/site";

const greenhouseFixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/greenhouse.json"), "utf8"));

let site: Awaited<ReturnType<typeof startFixtureSite>>;
let http: Http;
const renderer = createRenderer();
const requested: string[] = [];

beforeAll(async () => {
  site = await startFixtureSite();
  const real = createHttp({ retries: 0 });
  // Real HTTP to the fixture site; the Greenhouse API (unreachable here) is answered from a fixture.
  http = {
    json: async (url, init) => (url.startsWith("https://boards-api.greenhouse.io/v1/boards/gammaco/") ? greenhouseFixture : real.json(url, init)),
    text: async (url) => {
      requested.push(new URL(url).pathname);
      return real.text(url);
    },
  };
});
afterAll(async () => {
  await renderer.close();
  await site?.close();
});

describe("careers page scraping", () => {
  it("follows pagination and reads JSON-LD job pages, respecting robots.txt", async () => {
    const out = await scrapeCareersPage(`${site.base}/acme/careers`, "", { http, render: renderer.render });
    expect(out.method).toBe("json-ld");
    expect(out.nameHint).toBe("Acme Rockets");
    expect(out.jobs.map((j) => j.title).sort()).toEqual(["Hourly Support Associate", "Product Designer", "Senior Backend Engineer"]);
    expect(requested).not.toContain("/acme/jobs/104");
    expect(out.jobs.find((j) => j.title === "Product Designer")!.applyUrl).toBe(`${site.base}/acme/jobs/102`);
  });

  it("reads plain HTML job pages and drops non-job pages", async () => {
    const out = await scrapeCareersPage(`${site.base}/beta/careers`, "", { http });
    expect(out.method).toBe("html");
    expect(out.jobs.map((j) => [j.title, j.location])).toEqual([
      ["Senior Designer", "London, UK"],
      ["Data Engineer II", "Remote (Europe)"],
    ]);
  });

  it("switches to the platform API when a page embeds a Greenhouse board", async () => {
    const out = await scrapeCareersPage(`${site.base}/gamma/careers`, "Gamma", { http });
    expect(out.upgrade).toEqual({ ats: "greenhouse", token: "gammaco" });
    expect(out.method).toBe("platform");
    expect(out.jobs).toHaveLength(2);
  });

  it("finds nothing on a JavaScript-only site without a browser…", async () => {
    const out = await scrapeCareersPage(`${site.base}/delta/careers`, "", { http });
    expect(out.jobs).toHaveLength(0);
  });

  it("…and finds its jobs with the headless browser", async () => {
    const out = await scrapeCareersPage(`${site.base}/delta/careers`, "", { http, render: renderer.render });
    expect(out.method).toBe("rendered");
    expect(out.jobs.map((j) => [j.title, j.location, j.remote])).toEqual([
      ["Platform Engineer", "Remote", true],
      ["Data Analyst", "Chicago, IL", false],
    ]);
  }, 60_000);
});
