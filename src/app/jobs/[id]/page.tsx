import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyAvatar, JobCard } from "@/components/JobCard";
import { prisma } from "@/lib/db";
import { formatSalary, timeAgo } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function getJob(id: string) {
  return prisma.job.findUnique({ where: { id }, include: { company: true } });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const job = await getJob((await params).id);
  return { title: job ? `${job.title} at ${job.company.name} · JobScout` : "Job not found · JobScout" };
}

export default async function JobPage({ params }: { params: Params }) {
  const job = await getJob((await params).id);
  if (!job) notFound();
  const more = await prisma.job.findMany({
    where: { companyId: job.companyId, isActive: true, id: { not: job.id } },
    orderBy: { firstSeenAt: "desc" },
    take: 5,
    include: { company: true },
  });
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const facts = [
    ["Location", job.location],
    ["Workplace", job.remote ? "Remote" : "On-site / hybrid"],
    ["Department", job.department],
    ["Type", job.employmentType],
    ["Level", job.seniority],
    ["Salary", salary],
    ["Posted", timeAgo(job.postedAt ?? job.firstSeenAt)],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <article className="min-w-0 space-y-5">
        <Link href="/" className="text-sm text-brand-600 hover:underline">← All jobs</Link>
        <header className="flex gap-4">
          <CompanyAvatar name={job.company.name} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              <Link href={`/?company=${job.company.slug}`} className="hover:underline">{job.company.name}</Link> · {job.location}
            </p>
          </div>
        </header>
        {!job.isActive && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            This posting is no longer on {job.company.name}&apos;s careers page and may be closed.
          </p>
        )}
        <div className="card whitespace-pre-line p-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {job.descriptionText || "The full description is on the company's careers page."}
        </div>
      </article>

      <aside className="space-y-4 lg:pt-10">
        <div className="card space-y-4 p-4">
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn w-full">
            Apply on company site ↗
          </a>
          <dl className="space-y-2 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {more.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">More at {job.company.name}</h2>
            {more.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        )}
      </aside>
    </div>
  );
}
