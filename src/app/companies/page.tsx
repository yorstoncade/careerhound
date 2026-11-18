import Link from "next/link";
import { CompanyAvatar } from "@/components/JobCard";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies · JobScout" };

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    select: {
      slug: true, name: true, ats: true, lastScrapedAt: true, lastError: true,
      _count: { select: { jobs: { where: { isActive: true } } } },
    },
  });
  const indexed = companies.filter((c) => c._count.jobs > 0).sort((a, b) => b._count.jobs - a._count.jobs);
  const pending = companies.length - indexed.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {indexed.length} companies with open roles
          {pending > 0 && `, ${pending} more tracked with no open roles or not yet reachable`}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indexed.map((c) => (
          <Link key={c.slug} href={`/?company=${c.slug}`} className="card flex items-center gap-3 p-4 hover:border-brand-500/50">
            <CompanyAvatar name={c.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.name}</p>
              <p className="text-xs text-zinc-500">
                {c._count.jobs} open {c._count.jobs === 1 ? "role" : "roles"} · updated {timeAgo(c.lastScrapedAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
