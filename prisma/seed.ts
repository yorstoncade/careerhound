/**
 * Load data/companies.json into the Company table. Safe to re-run: existing companies are updated.
 * Each entry is either a platform board:  { name, ats: greenhouse|lever|ashby|workable|smartrecruiters|workday, token }
 * or any careers page URL:                { name, url: "https://acme.com/careers" }
 * URLs of known platforms are recognized here; other pages are checked (and upgraded if they
 * embed a known platform) the first time they're scraped. Seeding itself never goes online.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { adapters } from "../src/lib/ats";
import { detectFromUrl } from "../src/lib/careers/detect";
import { normalizeCareersUrl } from "../src/lib/careers/addCompany";

interface SeedCompany {
  name: string;
  ats?: string;
  token?: string;
  url?: string;
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
    let ats = c.ats;
    let token = c.token;
    let careersUrl: string | undefined;
    if (c.url) {
      try {
        careersUrl = normalizeCareersUrl(new URL(c.url));
      } catch {
        console.warn(`skip ${c.name}: invalid url "${c.url}"`);
        continue;
      }
      const d = detectFromUrl(careersUrl);
      ats = d?.ats ?? "careers-page";
      token = d?.token ?? careersUrl;
    }
    if (!ats || !token || !(ats in adapters)) {
      console.warn(`skip ${c.name}: needs a "url", or a known "ats" and "token"`);
      continue;
    }
    // A careers page may already have been upgraded to its platform; match it by its original URL.
    const existing =
      (await db.company.findUnique({ where: { ats_token: { ats, token } } })) ??
      (careersUrl ? await db.company.findFirst({ where: { careersUrl } }) : null);
    if (existing) {
      await db.company.update({ where: { id: existing.id }, data: { name: c.name, website: c.website } });
    } else {
      let slug = slugify(c.name);
      for (let i = 2; await db.company.findUnique({ where: { slug } }); i++) slug = `${slugify(c.name)}-${i}`;
      await db.company.create({ data: { name: c.name, slug, ats, token, careersUrl, website: c.website } });
    }
    n++;
  }
  console.log(`Seeded ${n} companies from ${path.relative(process.cwd(), file)}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
