# JobScout

JobScout collects job openings straight from company careers pages into one searchable feed. It also sends email alerts when new jobs match a saved search.

It doesn't scrape HTML. Most companies host their careers page on an applicant tracking system (ATS) with a public JSON job-board API, and JobScout reads those APIs directly:

| ATS | Endpoint |
|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever | `api.lever.co/v0/postings/{token}?mode=json` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true` |
| Workable | `apply.workable.com/api/v1/widget/accounts/{token}?details=true` |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{token}/postings` |

Each job is normalized: title, department, location, remote, seniority and salary. Salary comes from structured fields where the ATS provides them, otherwise it is parsed from the description.

## Quick start

```bash
npm install
cp .env.example .env
npx prisma migrate dev        # creates prisma/dev.db and seeds data/companies.json
npm run scrape                # fetch live jobs (or: npm run scrape -- --demo for offline sample data)
npm run dev                   # http://localhost:3000
```

## Commands

| Command | What it does |
|---|---|
| `npm run scrape` | Fetch every company's board; upsert jobs; mark jobs that disappeared as closed |
| `npm run scrape -- stripe ramp` | Only these company slugs |
| `npm run scrape -- --demo` | Offline: fictional companies with generated data in each ATS's real response format |
| `npm run alerts` | Email each confirmed, due alert a digest of jobs first seen since its last email |
| `npm run db:seed` | Re-load `data/companies.json` (or `npm run db:seed -- path/to/list.json`) |
| `npm test` | Adapter, normalization and search tests (fixtures in `tests/fixtures`) |

### Scheduling

Run the scraper and then the alerts on a schedule, e.g. with cron:

```cron
0 */6 * * *  cd /srv/jobscout && npm run scrape && npm run alerts
```

Alerts are sent at most once per period (daily/weekly) regardless of how often the job runs.

## Adding companies

Add entries to `data/companies.json` and run `npm run db:seed`:

```json
{ "name": "Acme", "ats": "greenhouse", "token": "acme" }
```

The token is the board slug in the company's careers URL: `boards.greenhouse.io/<token>`, `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`, `apply.workable.com/<token>`, `jobs.smartrecruiters.com/<token>`. The bundled list is a starting point and hasn't been checked against the live APIs. A company whose token is wrong or out of date fails on its own: the error is stored in `Company.lastError` and printed in the scrape summary.

## Email

Without `SMTP_HOST`, emails are written as `.eml` files to `./outbox`, which is handy in development. Set the `SMTP_*` variables in `.env` to send real email. Alerts use double opt-in: a confirmation link, then digests, and every email has an unsubscribe link.

## API

`GET /api/jobs` takes the same query params as the feed and returns JSON. The params are `q`, `location`, `remote=1`, `department`, `company` (slug), `seniority`, `minSalary`, `posted=24h|7d|30d`, `sort=newest|salary` and `page`.

## Layout

```
src/lib/ats/        one adapter per ATS (url + pure parse function)
src/lib/normalize   html→text, remote/seniority detection, salary parsing
src/lib/search      filter parsing + Prisma query building (shared by UI, API and alerts)
src/lib/scraper     fetch with retry, upsert, close stale jobs
src/lib/alerts      confirmation + digest emails
scripts/            scrape, send-alerts, demo data
```

## Scaling notes

- Search uses SQLite `LIKE`, which is fine for tens of thousands of jobs. Beyond that, move to SQLite FTS5 or Postgres full-text search. Switching to Postgres only takes a change to the `provider` in `prisma/schema.prisma`.
- To grow the company list, you can discover board tokens by crawling the "careers" links on company sites and matching the ATS URL patterns above.
