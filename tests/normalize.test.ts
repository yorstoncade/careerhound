import { describe, expect, it } from "vitest";
import { detectSeniority, htmlToText, isRemote, parseSalary } from "@/lib/normalize";

describe("parseSalary", () => {
  it.each([
    ["$120,000 - $150,000", { min: 120000, max: 150000, currency: "USD" }],
    ["range: $120k–$150k plus equity", { min: 120000, max: 150000, currency: "USD" }],
    ["USD 90K to 110K", { min: 90000, max: 110000, currency: "USD" }],
    ["£60,000 — £80,000 per annum", { min: 60000, max: 80000, currency: "GBP" }],
  ])("%s", (text, expected) => expect(parseSalary(text)).toEqual(expected));

  it.each(["$25 - $30 per hour", "$40 - $50/hr", "Series B, $100 - $200 million raised", "no numbers"])(
    "rejects %s",
    (text) => expect(parseSalary(text)).toBeNull(),
  );
});

describe("detectSeniority", () => {
  it.each([
    ["Software Engineer", "Mid"],
    ["Sr. Software Engineer", "Senior"],
    ["Staff Engineer", "Staff"],
    ["Engineering Manager", "Manager"],
    ["VP of Sales", "Executive"],
    ["Head of Design", "Executive"],
    ["Summer Intern, Data", "Intern"],
    ["New Grad Software Engineer", "Junior"],
    ["Director, Finance", "Director"],
  ])("%s → %s", (title, level) => expect(detectSeniority(title)).toBe(level));
});

describe("isRemote", () => {
  it("detects remote wording", () => {
    expect(isRemote("Remote - US")).toBe(true);
    expect(isRemote("Anywhere in Europe")).toBe(true);
    expect(isRemote("Austin, TX", null, false)).toBe(false);
    expect(isRemote("Austin, TX", true)).toBe(true);
  });
});

describe("htmlToText", () => {
  it("keeps structure and strips tags and scripts", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b></p><script>x()</script><ul><li>One</li><li>Two</li></ul>")).toBe(
      "Hello world\n\n• One\n• Two",
    );
  });
});
