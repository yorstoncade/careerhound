import { prisma } from "./db";
import { buildOrderBy, buildWhere, PAGE_SIZE, type JobFilters } from "./search";

export async function searchJobs(filters: JobFilters, page = 1) {
  const where = buildWhere(filters);
  const skip = (Math.max(1, page) - 1) * PAGE_SIZE;
  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({ where, orderBy: buildOrderBy(filters), skip, take: PAGE_SIZE, include: { company: true } }),
  ]);
  return { total, jobs, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Options for the filter dropdowns, based on currently active jobs. */
export async function filterOptions() {
  const [departments, companies, totals] = await Promise.all([
    prisma.job.groupBy({
      by: ["department"],
      where: { isActive: true, department: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { department: "desc" } },
      take: 40,
    }),
    prisma.company.findMany({
      where: { jobs: { some: { isActive: true } } },
      select: { slug: true, name: true, _count: { select: { jobs: { where: { isActive: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.job.count({ where: { isActive: true } }),
  ]);
  return {
    departments: departments.map((d) => ({ name: d.department!, count: d._count._all })),
    companies: companies.map((c) => ({ slug: c.slug, name: c.name, count: c._count.jobs })),
    totalJobs: totals,
  };
}
