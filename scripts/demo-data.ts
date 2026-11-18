/**
 * Offline demo data: fictional companies whose "API responses" are generated in each ATS's
 * real JSON shape, so `npm run scrape -- --demo` exercises the real adapters and upsert logic
 * without network access.
 */
import type { Company } from "@prisma/client";
import type { AtsName } from "../src/lib/ats";

export const DEMO_COMPANIES: { name: string; ats: AtsName; token: string }[] = [
  { name: "Northwind Analytics", ats: "greenhouse", token: "demo-northwind" },
  { name: "Lumen Health", ats: "greenhouse", token: "demo-lumen" },
  { name: "Kestrel Robotics", ats: "greenhouse", token: "demo-kestrel" },
  { name: "Harbor Pay", ats: "lever", token: "demo-harborpay" },
  { name: "Quill Labs", ats: "lever", token: "demo-quill" },
  { name: "Orbital Freight", ats: "lever", token: "demo-orbital" },
  { name: "Tessera AI", ats: "ashby", token: "demo-tessera" },
  { name: "Brightline Security", ats: "ashby", token: "demo-brightline" },
  { name: "Fernway", ats: "ashby", token: "demo-fernway" },
  { name: "Copperleaf Games", ats: "workable", token: "demo-copperleaf" },
  { name: "Atlas Climate", ats: "workable", token: "demo-atlas" },
  { name: "Meridian Retail Group", ats: "smartrecruiters", token: "demo-meridian" },
  { name: "Solace Insurance", ats: "smartrecruiters", token: "demo-solace" },
];

const ROLES: [string, string, number][] = [
  // title, department, base salary (USD)
  ["Software Engineer", "Engineering", 150000],
  ["Backend Engineer", "Engineering", 155000],
  ["Frontend Engineer", "Engineering", 145000],
  ["Machine Learning Engineer", "Engineering", 185000],
  ["Site Reliability Engineer", "Infrastructure", 165000],
  ["Data Scientist", "Data", 160000],
  ["Data Analyst", "Data", 110000],
  ["Product Manager", "Product", 170000],
  ["Product Designer", "Design", 140000],
  ["Account Executive", "Sales", 120000],
  ["Sales Development Representative", "Sales", 70000],
  ["Customer Success Manager", "Customer Success", 95000],
  ["Marketing Manager", "Marketing", 125000],
  ["Content Strategist", "Marketing", 100000],
  ["Recruiter", "People", 105000],
  ["Financial Analyst", "Finance", 115000],
  ["Security Engineer", "Security", 175000],
  ["Operations Associate", "Operations", 75000],
];
const LEVELS: [string, number][] = [
  ["", 1], ["Senior ", 1.25], ["Staff ", 1.5], ["Junior ", 0.8], ["Lead ", 1.35], ["", 1], ["Senior ", 1.25],
];
const PLACES = [
  "San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Remote - US", "London, UK",
  "Berlin, Germany", "Toronto, Canada", "Remote", "Chicago, IL", "Amsterdam, Netherlands", "Denver, CO",
];

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

interface Gen {
  id: string;
  title: string;
  dept: string;
  place: string;
  remote: boolean;
  min: number;
  max: number;
  showSalary: boolean;
  posted: Date;
  html: string;
}

function generate(company: string, token: string, now: Date): Gen[] {
  const r = rng(token);
  const n = 8 + Math.floor(r() * 12);
  const out: Gen[] = [];
  for (let i = 0; i < n; i++) {
    const [role, dept, base] = ROLES[Math.floor(r() * ROLES.length)];
    const [lvl, mult] = LEVELS[Math.floor(r() * LEVELS.length)];
    const place = PLACES[Math.floor(r() * PLACES.length)];
    const mid = Math.round((base * mult) / 5000) * 5000;
    const min = mid - 15000;
    const max = mid + 25000;
    const showSalary = r() < 0.7;
    const title = `${lvl}${role}`;
    const html = `<p>${company} is hiring a <strong>${title}</strong> to join our ${dept} team.</p>
<h3>What you'll do</h3><ul><li>Own meaningful projects from idea to launch</li><li>Partner closely with ${dept === "Engineering" ? "product and design" : "engineering and leadership"}</li><li>Help shape how the ${dept} team works as we grow</li></ul>
<h3>What we're looking for</h3><ul><li>${lvl.startsWith("Senior") || lvl.startsWith("Staff") || lvl.startsWith("Lead") ? "5+" : "2+"} years of relevant experience</li><li>Clear written communication</li><li>Curiosity and a bias to action</li></ul>
${showSalary ? `<p>The annual base salary range for this role is $${min.toLocaleString("en-US")} - $${max.toLocaleString("en-US")}, plus equity and benefits.</p>` : ""}`;
    out.push({
      id: `${token}-${i + 1}`,
      title,
      dept,
      place,
      remote: /remote/i.test(place),
      min,
      max,
      showSalary,
      posted: new Date(now.getTime() - Math.floor(r() * 40 * 864e5)),
      html,
    });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Return a payload in the given ATS's response format. */
export function demoPayload(company: Pick<Company, "name" | "ats" | "token">, now = new Date()): unknown {
  const jobs = generate(company.name, company.token, now);
  const base = `https://example.com/${company.token}/jobs`;
  switch (company.ats) {
    case "greenhouse":
      return {
        jobs: jobs.map((j, i) => ({
          id: 4000000 + i + company.token.length * 1000,
          title: j.title,
          absolute_url: `${base}/${j.id}`,
          updated_at: j.posted.toISOString(),
          first_published: j.posted.toISOString(),
          location: { name: j.place },
          content: esc(j.html), // Greenhouse returns HTML entity-encoded
          departments: [{ name: j.dept }],
          metadata: null,
        })),
      };
    case "lever":
      return jobs.map((j) => ({
        id: j.id,
        text: j.title,
        hostedUrl: `${base}/${j.id}`,
        createdAt: j.posted.getTime(),
        workplaceType: j.remote ? "remote" : "on-site",
        categories: { commitment: "Full-time", department: j.dept, location: j.place, allLocations: [j.place] },
        descriptionPlain: plain(j.html.split("<h3>")[0]),
        lists: [{ text: "What you'll do", content: j.html.split("<h3>What you'll do</h3>")[1].split("<h3>")[0] }],
        salaryRange: j.showSalary ? { min: j.min, max: j.max, currency: "USD", interval: "per-year-salary" } : undefined,
      }));
    case "ashby":
      return {
        jobs: jobs.map((j) => ({
          id: j.id,
          title: j.title,
          department: j.dept,
          employmentType: "FullTime",
          location: j.place,
          isRemote: j.remote,
          isListed: true,
          descriptionHtml: j.html,
          publishedAt: j.posted.toISOString(),
          jobUrl: `${base}/${j.id}`,
          compensation: j.showSalary
            ? { summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: j.min, maxValue: j.max }] }
            : { summaryComponents: [] },
        })),
      };
    case "workable":
      return {
        name: company.name,
        jobs: jobs.map((j) => {
          const [city, country] = j.place.split(", ");
          return {
            title: j.title,
            shortcode: j.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-10),
            employment_type: "Full-time",
            telecommuting: j.remote,
            department: j.dept,
            url: `${base}/${j.id}`,
            published_on: j.posted.toISOString().slice(0, 10),
            locations: [{ city: j.remote ? undefined : city, country: country ?? (j.remote ? "Remote" : "") }],
            description: j.html,
          };
        }),
      };
    case "smartrecruiters":
      return {
        totalFound: jobs.length,
        content: jobs.map((j) => ({
          id: j.id,
          name: j.title,
          releasedDate: j.posted.toISOString(),
          company: { identifier: company.token },
          location: { fullLocation: j.place, remote: j.remote },
          department: { label: j.dept },
          typeOfEmployment: { label: "Full-time" },
          experienceLevel: { label: j.title.startsWith("Senior") ? "Mid-Senior Level" : "Associate" },
        })),
      };
    default:
      throw new Error(`no demo data for ${company.ats}`);
  }
}
