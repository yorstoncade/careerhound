/**
 * Fake company careers sites for tests, mirroring real-world patterns:
 *   /acme   listing (2 pages) + job pages with JSON-LD; robots.txt blocks one job
 *   /beta   plain HTML listing + job pages, no structured data
 *   /gamma  careers page that embeds a Greenhouse job board
 *   /delta  JavaScript-only listing and job pages
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

const layout = (title: string, body: string, head = "") => `<!doctype html><html><head><title>${title}</title>${head}</head>
<body><header><nav><a href="/acme/careers/benefits">Benefits</a> <a href="/acme/careers">Careers</a></nav></header>
${body}
<footer><a href="/acme/jobs/privacy">Privacy</a></footer></body></html>`;

const jsonLd = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

const ACME_JOBS: Record<string, object> = {
  "101": {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Senior Backend Engineer",
    description: "<p>Build our APIs.</p><ul><li>Go</li><li>Postgres</li></ul>",
    datePosted: "2026-11-10",
    employmentType: "FULL_TIME",
    identifier: { "@type": "PropertyValue", name: "Acme", value: "ACME-101" },
    hiringOrganization: { "@type": "Organization", name: "Acme Rockets" },
    jobLocation: { "@type": "Place", address: { addressLocality: "Denver", addressRegion: "CO", addressCountry: "US" } },
    baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { minValue: 150000, maxValue: 190000, unitText: "YEAR" } },
  },
  "102": {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Product Designer" },
      {
        "@type": "JobPosting",
        title: "Product Designer",
        description: "&lt;p&gt;Design things people love.&lt;/p&gt;",
        datePosted: "2026-11-12",
        employmentType: ["FULL_TIME"],
        jobLocationType: "TELECOMMUTE",
        applicantLocationRequirements: { "@type": "Country", name: "USA" },
        hiringOrganization: { "@type": "Organization", name: "Acme Rockets" },
      },
    ],
  },
  "103": {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Hourly Support Associate",
    description: "Help customers.",
    hiringOrganization: "Acme Rockets",
    jobLocation: [{ address: "Austin, TX" }, { address: { addressLocality: "Remote" } }],
    baseSalary: { currency: "USD", value: { value: 25, unitText: "HOUR" } },
  },
  "104": { "@type": "JobPosting", title: "Blocked By Robots" },
};

export const PAGES: Record<string, string | ((base: string) => string)> = {
  "/robots.txt": "User-agent: *\nDisallow: /acme/jobs/104\nAllow: /\n",

  "/acme/careers": layout(
    "Careers | Acme Rockets",
    `<main><h1>Open roles</h1>
     <a href="/acme/careers?department=eng">Engineering</a>
     <ul>
       <li><a href="/acme/jobs/101"><h3>Senior Backend Engineer</h3><span>Denver, CO</span></a> <a href="/acme/jobs/101">Apply</a></li>
       <li><a href="/acme/jobs/102">Product Designer</a></li>
     </ul>
     <a href="https://elsewhere.example.org/jobs/1">Partner job</a>
     <a rel="next" href="/acme/careers?page=2">Next</a></main>`,
    '<meta property="og:site_name" content="Acme Rockets">',
  ),
  "/acme/careers?page=2": layout(
    "Careers | Acme Rockets",
    `<main><ul><li><a href="/acme/jobs/103">Hourly Support Associate</a></li><li><a href="/acme/jobs/104">Blocked By Robots</a></li></ul></main>`,
  ),
  ...Object.fromEntries(
    Object.entries(ACME_JOBS).map(([id, data]) => [`/acme/jobs/${id}`, layout("Job | Acme", `<main>${jsonLd(data)}<h1>Job</h1></main>`)]),
  ),

  "/beta/careers": layout(
    "Join Beta Labs",
    `<main><div class="openings">
      <a class="card" href="/beta/careers/senior-designer"><h3>Senior Designer</h3><p>London</p></a>
      <a class="card" href="/beta/careers/data-engineer-ii"><h3>Data Engineer II</h3><p>Remote</p></a>
      <a class="card" href="/beta/careers/life-at-beta"><h3>Life at Beta</h3></a>
      <a class="card" href="/beta/careers/benefits"><h3>Our benefits</h3></a>
    </div></main>`,
  ),
  "/beta/careers/senior-designer": layout(
    "Senior Designer – Beta Labs",
    `<main><h1>Senior Designer</h1><p><strong>Location:</strong> London, UK</p>
     <div class="job-description"><p>${"We are looking for a senior designer to shape our product. ".repeat(6)}</p>
     <ul><li>5+ years experience</li></ul><p>Salary: £70,000 - £85,000</p></div>
     <a class="button" href="/beta/apply/1">Apply for this job</a></main>`,
  ),
  "/beta/careers/data-engineer-ii": layout(
    "Data Engineer II – Beta Labs",
    `<main><h1>Data Engineer II</h1><dl><dt>Location</dt><dd>Remote (Europe)</dd></dl>
     <article><p>${"Build reliable data pipelines with us. ".repeat(10)}</p></article>
     <a href="/beta/apply/2">Apply now</a></main>`,
  ),
  "/beta/careers/life-at-beta": layout("Life at Beta", `<main><h1>Life at Beta</h1><p>We like plants.</p></main>`),

  "/gamma/careers": layout(
    "Gamma Co Careers",
    `<main><h1>Work at Gamma</h1><div id="grnhse_app"></div>
     <script src="https://boards.greenhouse.io/embed/job_board/js?for=gammaco"></script></main>`,
  ),

  "/delta/careers": `<!doctype html><html><head><title>Delta Careers</title></head><body><div id="root">Loading…</div>
<script>setTimeout(function(){document.getElementById('root').innerHTML=
'<ul><li><a href="/delta/jobs/1">Platform Engineer</a></li><li><a href="/delta/jobs/2">Data Analyst</a></li></ul>'},300)</script></body></html>`,
  "/delta/jobs/1": deltaJob("Platform Engineer", "Remote"),
  "/delta/jobs/2": deltaJob("Data Analyst", "Chicago, IL"),
};

function deltaJob(title: string, location: string) {
  const body = `<main><h1>${title}</h1><p>Location: ${location}</p><p>${"Join the Delta team and do great work. ".repeat(8)}</p><a href="#">Apply now</a></main>`;
  return `<!doctype html><html><head><title>${title}</title></head><body><div id="root"></div>
<script>setTimeout(function(){document.getElementById('root').innerHTML=${JSON.stringify(body)}},200)</script></body></html>`;
}

/** Remove a page, e.g. to simulate a job being taken down. */
export const removed = new Set<string>();

export async function startFixtureSite(port = 0): Promise<{ base: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const key = u.pathname + u.search;
    // Unknown query strings (e.g. ?department=eng) fall back to the page itself, like real sites.
    const page = removed.has(key) || removed.has(u.pathname) ? undefined : (PAGES[key] ?? PAGES[u.pathname]);
    if (page === undefined) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }
    const base = `http://${req.headers.host}`;
    const html = typeof page === "function" ? page(base) : page;
    res.writeHead(200, { "Content-Type": key.endsWith(".txt") ? "text/plain" : "text/html; charset=utf-8" }).end(html);
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const { port: p } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(() => r())) };
}
