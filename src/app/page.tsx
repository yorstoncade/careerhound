import Link from "next/link";
import { AlertForm } from "@/components/AlertForm";
import { AutoSubmit } from "@/components/AutoSubmit";
import { FilterPanel } from "@/components/FilterPanel";
import { JobCard } from "@/components/JobCard";
import { filterOptions, searchJobs } from "@/lib/feed";
import { SENIORITY_LEVELS } from "@/lib/normalize";
import { describeFilters, filtersToQuery, parseFilters } from "@/lib/search";

type SP = Promise<Record<string, string | string[] | undefined>>;

const BANNERS: Record<string, [string, string]> = {
  confirmed: ["Your job alert is confirmed. You'll get new matches by email.", "emerald"],
  unsubscribed: ["You've been unsubscribed from that alert.", "zinc"],
  invalid: ["That link is invalid or has expired.", "red"],
};

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ total, jobs, pages }, opts] = await Promise.all([searchJobs(filters, page), filterOptions()]);
  const query = filtersToQuery(filters);
  const banner = typeof sp.alert === "string" ? BANNERS[sp.alert] : undefined;
  const hasFilters = query.length > 0;
  const activeFilters = (["remote", "seniority", "department", "company", "minSalary", "posted"] as const).filter(
    (k) => filters[k] !== undefined,
  ).length;

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-lg p-3 text-sm ${
            banner[1] === "emerald"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : banner[1] === "red"
                ? "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300"
                : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          }`}
        >
          {banner[0]}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Jobs straight from company careers pages
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {opts.totalJobs.toLocaleString()} open roles from {opts.companies.length.toLocaleString()} companies,
            refreshed from their own job boards, including roles that never make it to the big job sites.
          </p>
        </div>
        <form id="filters" method="get" action="/" className="flex flex-col gap-2 sm:flex-row">
          <input name="q" defaultValue={filters.q} className="input sm:flex-[2]" placeholder="Title, skill or company" aria-label="Keywords" />
          <input name="location" defaultValue={filters.location} className="input sm:flex-1" placeholder="City or country" aria-label="Location" />
          <button className="btn">Search</button>
          <AutoSubmit />
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside>
          <FilterPanel activeCount={activeFilters}>
          <div className="card space-y-4 p-4">
            <label className="flex items-center gap-2 text-sm">
              <input form="filters" type="checkbox" name="remote" value="1" defaultChecked={filters.remote} className="h-4 w-4 accent-brand-600" />
              Remote only
            </label>
            <div>
              <label className="label" htmlFor="seniority">Seniority</label>
              <select form="filters" id="seniority" name="seniority" defaultValue={filters.seniority ?? ""} className="input">
                <option value="">Any</option>
                {SENIORITY_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="department">Department</label>
              <select form="filters" id="department" name="department" defaultValue={filters.department ?? ""} className="input">
                <option value="">Any</option>
                {opts.departments.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.count})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="company">Company</label>
              <select form="filters" id="company" name="company" defaultValue={filters.company ?? ""} className="input">
                <option value="">Any</option>
                {opts.companies.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="minSalary">Minimum salary</label>
              <select form="filters" id="minSalary" name="minSalary" defaultValue={filters.minSalary ?? ""} className="input">
                <option value="">Any</option>
                {[50, 80, 100, 120, 150, 180, 200, 250].map((k) => <option key={k} value={k * 1000}>{k}k+</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="posted">Date posted</label>
              <select form="filters" id="posted" name="posted" defaultValue={filters.posted ?? ""} className="input">
                <option value="">Any time</option>
                <option value="24h">Past 24 hours</option>
                <option value="7d">Past week</option>
                <option value="30d">Past month</option>
              </select>
            </div>
            {hasFilters && <Link href="/" className="block text-center text-xs text-brand-600 hover:underline">Clear all filters</Link>}
          </div>
          <AlertForm query={query} summary={describeFilters(filters)} />
          </FilterPanel>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-900 dark:text-white">{total.toLocaleString()}</span> jobs
            </p>
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              Sort
              <select form="filters" name="sort" defaultValue={filters.sort ?? "newest"} className="input w-auto py-1.5">
                <option value="newest">Newest</option>
                <option value="salary">Highest salary</option>
              </select>
            </label>
          </div>

          {jobs.length === 0 ? (
            <div className="card p-10 text-center text-sm text-zinc-500">
              No jobs match these filters. Try removing one, or create an alert to hear about new matches.
            </div>
          ) : (
            jobs.map((j) => <JobCard key={j.id} job={j} />)
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3 pt-2 text-sm" aria-label="Pagination">
              {page > 1 ? <Link className="btn-ghost" href={`/?${filtersToQuery(filters, { page: page - 1 })}`}>← Previous</Link> : <span />}
              <span className="text-zinc-500">Page {page} of {pages}</span>
              {page < pages ? <Link className="btn-ghost" href={`/?${filtersToQuery(filters, { page: page + 1 })}`}>Next →</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
