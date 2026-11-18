/**
 * Pull jobs from every company's public ATS job board and update the database.
 *
 *   npm run scrape                     # all companies, live
 *   npm run scrape -- stripe ramp      # only these company slugs
 *   npm run scrape -- --demo           # offline: fictional companies with generated data
 */
import { PrismaClient } from "@prisma/client";
import { liveFetcher, scrapeAll, type Fetcher } from "../src/lib/scraper";
import { DEMO_COMPANIES, demoPayload } from "./demo-data";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const only = args.filter((a) => !a.startsWith("--"));
  const db = new PrismaClient();

  let fetcher: Fetcher = liveFetcher;
  let slugs = only;
  if (demo) {
    for (const c of DEMO_COMPANIES) {
      await db.company.upsert({
        where: { ats_token: { ats: c.ats, token: c.token } },
        create: { ...c, slug: slugify(c.name), website: `https://example.com/${c.token}` },
        update: {},
      });
    }
    fetcher = async (_url, company) => demoPayload(company);
    slugs = only.length ? only : DEMO_COMPANIES.map((c) => slugify(c.name));
  }

  const started = Date.now();
  const results = await scrapeAll(db, fetcher, {
    only: slugs,
    onResult: (r) =>
      console.log(
        r.ok
          ? `  ✓ ${r.company.padEnd(28)} ${String(r.found).padStart(4)} jobs  (+${r.created} new, -${r.closed} closed)`
          : `  ✗ ${r.company.padEnd(28)} ${r.error}`,
      ),
  });
  const ok = results.filter((r) => r.ok);
  const sum = (k: "found" | "created" | "closed") => ok.reduce((n, r) => n + r[k], 0);
  console.log(
    `\nScraped ${ok.length}/${results.length} companies in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      `${sum("found")} open jobs, ${sum("created")} new, ${sum("closed")} closed, ${results.length - ok.length} failed.`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
