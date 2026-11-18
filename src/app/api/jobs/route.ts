import { NextResponse, type NextRequest } from "next/server";
import { searchJobs } from "@/lib/feed";
import { parseFilters } from "@/lib/search";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters = parseFilters(sp);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const { total, pages, jobs } = await searchJobs(filters, page);
  return NextResponse.json({
    filters,
    total,
    page,
    pages,
    jobs: jobs.map(({ company, descriptionText, ...j }) => ({
      ...j,
      company: { name: company.name, slug: company.slug },
      snippet: descriptionText.slice(0, 280),
    })),
  });
}
