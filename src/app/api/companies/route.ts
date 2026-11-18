import { NextResponse, type NextRequest } from "next/server";
import { AddCompanyError, addCompanyFromUrl } from "@/lib/careers/addCompany";
import { prisma } from "@/lib/db";
import { createContext } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 120;

const LIMIT_PER_HOUR = 10;
const recent = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 36e5);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > LIMIT_PER_HOUR;
}

export async function POST(req: NextRequest) {
  if (process.env.ALLOW_ADD_COMPANY === "0") {
    return NextResponse.json({ error: "Adding companies is turned off on this site" }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many companies added recently. Try again in an hour." }, { status: 429 });
  }
  let body: { url?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const url = String(body.url ?? "").trim();
  if (!url || url.length > 2000) return NextResponse.json({ error: "Enter a careers page URL" }, { status: 400 });
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : undefined;

  const ctx = createContext();
  try {
    const r = await addCompanyFromUrl(prisma, url, { name, ctx });
    return NextResponse.json(
      {
        existed: r.existed,
        company: { name: r.company.name, slug: r.company.slug },
        found: r.found,
        via: r.via,
        method: r.method,
        sample: r.sample,
      },
      { status: r.existed ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof AddCompanyError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong while checking that page" }, { status: 500 });
  } finally {
    await ctx.close();
  }
}
