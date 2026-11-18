/**
 * Pull jobs from every company's public ATS job board and update the database.
 *
 *   npm run scrape                     # all companies, live
 *   npm run scrape -- stripe ramp      # only these company slugs
 *   npm run scrape -- --demo           # offline: fictional companies with generated data
 *   npm run scrape -- --demo-if-empty  # live, but load sample data if no jobs could be fetched at all
 */
import { PrismaClient } from "@prisma/client";
import { liveFetcher, scrapeAll, type CompanyResult, type Fetcher } from "../src/lib/scraper";
import { DEMO_COMPANIES, demoPayload } from "./demo-data";

const DEMO_TOKEN_PREFIX = "demo-";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function printResult(r: CompanyResult) {
  if (r.ok) console.log(`  ✓ ${r.company.padEnd(28)} ${String(r.found).padStart(4)} jobs  (+${r.created} new, -${r.closed} closed)`);
}

function printSummary(results: CompanyResult[], started: number) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  // List failures individually when there are a few; group them when there are many (e.g. offline).
  if (failed.length && failed.length <= 10) {
    for (const r of failed) console.log(`  ✗ ${r.company.padEnd(28)} ${r.error}`);
  } else if (failed.length) {
    const byError = new Map<string, string[]>();
    for (const r of failed) byError.set(r.error ?? "unknown error", [...(byError.get(r.error ?? "unknown error") ?? []), r.company]);
    for (const [error, names] of byError) {
      const shown = names.slice(0, 4).join(", ") + (names.length > 4 ? ` and ${names.length - 4} more` : "");
      console.log(`  ✗ ${names.length} companies failed (${error}): ${shown}`);
    }
  }
  const sum = (k: "found" | "created" | "closed") => ok.reduce((n, r) => n + r[k], 0);
  console.log(
    `\nScraped ${ok.length}/${results.length} companies in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      `${sum("found")} open jobs, ${sum("created")} new, ${sum("closed")} closed, ${results.length - ok.length} failed.`,
  );
}

async function scrape(db: PrismaClient, fetcher: Fetcher, only: string[]) {
  const started = Date.now();
  const results = await scrapeAll(db, fetcher, { only, onResult: printResult });
  printSummary(results, started);
  return results;
}

/** Load fictional sample companies and jobs, generated in each ATS's real response format. */
async function loadDemo(db: PrismaClient, only: string[] = []) {
  for (const c of DEMO_COMPANIES) {
    await db.company.upsert({
      where: { ats_token: { ats: c.ats, token: c.token } },
      create: { ...c, slug: slugify(c.name), website: `https://example.com/${c.token}` },
      update: {},
    });
  }
  const fetcher: Fetcher = async (_url, company) => demoPayload(company);
  return scrape(db, fetcher, only.length ? only : DEMO_COMPANIES.map((c) => slugify(c.name)));
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.filter((a) => !a.startsWith("--"));
  const db = new PrismaClient();

  if (args.includes("--demo")) {
    await loadDemo(db, only);
  } else {
    const live = await db.company.findMany({
      where: { NOT: { token: { startsWith: DEMO_TOKEN_PREFIX } } },
      select: { slug: true },
    });
    const slugs = only.length ? only : live.map((c) => c.slug);
    const results = await scrape(db, liveFetcher, slugs);

    if (results.some((r) => r.ok && r.found > 0)) {
      // Real jobs arrived: drop any sample data so it doesn't mix with real listings.
      const { count } = await db.company.deleteMany({ where: { token: { startsWith: DEMO_TOKEN_PREFIX } } });
      if (count) console.log(`Removed ${count} sample companies now that real jobs are available.`);
    } else if (args.includes("--demo-if-empty") && (await db.job.count({ where: { isActive: true } })) === 0) {
      console.log(
        "\n\x1b[33mCouldn't reach any job boards (are you offline?), so JobScout loaded sample jobs from made-up " +
          "companies instead. Real jobs will replace them the next time you start it with an internet connection.\x1b[0m",
      );
      await loadDemo(db);
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
