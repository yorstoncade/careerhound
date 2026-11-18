/**
 * Load data/companies.json into the Company table. Safe to re-run: existing companies are updated.
 * Each entry: { name, ats: greenhouse|lever|ashby|workable|smartrecruiters, token, website? }
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { adapters } from "../src/lib/ats";

interface SeedCompany {
  name: string;
  ats: string;
  token: string;
  website?: string;
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const db = new PrismaClient();
  const file = process.argv[2] ?? path.join(__dirname, "../data/companies.json");
  const list = JSON.parse(await readFile(file, "utf8")) as SeedCompany[];
  let n = 0;
  for (const c of list) {
    if (!(c.ats in adapters)) {
      console.warn(`skip ${c.name}: unknown ats "${c.ats}"`);
      continue;
    }
    const slug = slugify(c.name);
    await db.company.upsert({
      where: { ats_token: { ats: c.ats, token: c.token } },
      create: { name: c.name, slug, ats: c.ats, token: c.token, website: c.website },
      update: { name: c.name, website: c.website },
    });
    n++;
  }
  console.log(`Seeded ${n} companies from ${path.relative(process.cwd(), file)}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
