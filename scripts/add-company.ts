/**
 * Add a company from any careers page URL.
 *
 *   npm run add-company -- https://acme.com/careers
 *   npm run add-company -- https://acme.wd5.myworkdayjobs.com/External --name "Acme"
 */
import { PrismaClient } from "@prisma/client";
import { AddCompanyError, addCompanyFromUrl } from "../src/lib/careers/addCompany";
import { createContext } from "../src/lib/scraper";

async function main() {
  const args = process.argv.slice(2);
  const nameIdx = args.indexOf("--name");
  const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
  const url = args.find((a, i) => !a.startsWith("--") && (nameIdx < 0 || i !== nameIdx + 1));
  if (!url) {
    console.log('Usage: npm run add-company -- <careers page URL> [--name "Company name"]');
    process.exit(1);
  }

  const db = new PrismaClient();
  const ctx = createContext();
  console.log(`Checking ${url} …`);
  try {
    const r = await addCompanyFromUrl(db, url, { name, ctx });
    const how = r.method === "platform" ? `via ${r.via}` : `via careers page (${r.method})`;
    console.log(
      r.existed
        ? `\nAlready tracked: ${r.company.name} — ${r.found} open jobs ${how}.`
        : `\n\x1b[32mAdded ${r.company.name}\x1b[0m — found ${r.found} jobs ${how}.`,
    );
    for (const t of r.sample) console.log(`  • ${t}`);
    console.log(`\nSee them at /?company=${r.company.slug}`);
  } catch (e) {
    console.error(`\n\x1b[31m${e instanceof AddCompanyError ? e.message : (e as Error).stack}\x1b[0m`);
    process.exitCode = 1;
  } finally {
    await ctx.close();
    await db.$disconnect();
  }
}

main();
