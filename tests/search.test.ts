import { describe, expect, it } from "vitest";
import { buildWhere, describeFilters, filtersToQuery, parseFilters } from "@/lib/search";

describe("parseFilters", () => {
  it("keeps valid values and drops invalid ones", () => {
    const f = parseFilters({
      q: "  rust engineer ",
      remote: "1",
      seniority: "Wizard",
      minSalary: "abc",
      posted: "7d",
      sort: "salary",
      location: "",
    });
    expect(f).toEqual({ q: "rust engineer", remote: true, posted: "7d", sort: "salary" });
  });
  it("round-trips through a query string", () => {
    const f = parseFilters({ q: "design", company: "acme", minSalary: "120000", seniority: "Senior" });
    expect(parseFilters(new URLSearchParams(filtersToQuery(f)))).toEqual(f);
  });
});

describe("buildWhere", () => {
  it("adds one OR clause per search term plus active filter", () => {
    const w = buildWhere({ q: "senior rust" }) as { AND: unknown[] };
    expect(w.AND).toHaveLength(3);
    expect(w.AND[0]).toEqual({ isActive: true });
  });
  it("filters salary on the top of the range and posted on date", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    const w = buildWhere({ minSalary: 150000, posted: "24h" }, { now }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ salaryMax: { gte: 150000 } });
    const since = new Date("2026-11-17T00:00:00Z");
    expect(w.AND).toContainEqual({ OR: [{ postedAt: { gte: since } }, { postedAt: null, firstSeenAt: { gte: since } }] });
  });
  it("restricts to jobs first seen after a date for alerts", () => {
    const d = new Date("2026-11-01T00:00:00Z");
    expect((buildWhere({}, { newSince: d }) as { AND: unknown[] }).AND).toContainEqual({ firstSeenAt: { gt: d } });
  });
});

describe("describeFilters", () => {
  it("summarizes", () => {
    expect(describeFilters({})).toBe("all new jobs");
    expect(describeFilters({ q: "designer", remote: true, minSalary: 120000 })).toBe('"designer", remote, paying 120,000+');
  });
});

describe("alert filter storage", () => {
  it("restores the filters an alert was created with", async () => {
    const { alertFilters } = await import("@/lib/alerts");
    const f = parseFilters(new URLSearchParams("q=engineer&remote=1&minSalary=150000&posted=7d"));
    expect(alertFilters({ query: filtersToQuery(f) })).toEqual(f);
  });
});
