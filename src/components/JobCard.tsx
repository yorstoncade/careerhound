import Link from "next/link";
import type { Company, Job } from "@prisma/client";
import { formatSalary, timeAgo } from "@/lib/format";

export function CompanyAvatar({ name }: { name: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-semibold text-white"
      style={{ background: `hsl(${hue} 55% 45%)` }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function JobCard({ job }: { job: Job & { company: Company } }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const isNew = Date.now() - job.firstSeenAt.getTime() < 864e5;
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="card flex gap-4 p-4 transition hover:border-brand-500/50 hover:shadow-sm"
    >
      <CompanyAvatar name={job.company.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{job.title}</h3>
            <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
              {job.company.name} · {job.location}
            </p>
          </div>
          <span className="shrink-0 text-xs text-zinc-500">{timeAgo(job.postedAt ?? job.firstSeenAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isNew && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">New</span>}
          {salary && <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{salary}</span>}
          {job.remote && <span className="chip">Remote</span>}
          {job.seniority && job.seniority !== "Mid" && <span className="chip">{job.seniority}</span>}
          {job.department && <span className="chip">{job.department}</span>}
        </div>
      </div>
    </Link>
  );
}
