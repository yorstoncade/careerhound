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

## Run it without the terminal

1. **Install Node.js** (one time): download the **LTS** version from [nodejs.org](https://nodejs.org) and install it.
2. **Download JobScout**: on GitHub, click **Code ▸ Download ZIP**, then unzip it.
3. **Double-click the launcher** in the unzipped folder:
   - **Mac:** `start.command`
   - **Windows:** `start.bat`

A window opens, sets everything up and opens JobScout in your browser at http://localhost:3000. The first launch takes a few minutes while it downloads what it needs and builds the site. Later launches take a few seconds. Each launch fetches the latest jobs.

Keep the window open while you use JobScout. Close it, or press Ctrl+C, to stop.

**The first time only, your computer may block the launcher** because it isn't from an app store:
- **Mac:** "cannot be opened because it is from an unidentified developer". Right-click `start.command`, choose **Open**, then click **Open** again. If it says the file isn't executable, open Terminal, type `chmod +x ` (with a space), drag the file into the window and press Enter.
- **Windows:** "Windows protected your PC". Click **More info**, then **Run anyway**.

If the launcher can't reach any job boards (for example, you're offline), it loads sample jobs from made-up companies so you can still try the site. Real jobs replace them the next time it can connect.

## Quick start (terminal)

```bash
npm run setup                 # installs dependencies, creates .env and the database, loads companies
npm run launch                # fetches jobs, builds, starts and opens http://localhost:3000
```

For development, use `npm run scrape` (or `npm run scrape -- --demo` for offline sample data), then `npm run dev`.

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | One-time setup; safe to re-run (skips finished steps) |
| `npm run launch` | Setup + fetch jobs + build if needed + start + open browser. Set `JOBSCOUT_NO_OPEN=1` to skip the browser |
| `npm run scrape` | Fetch every company's board; upsert jobs; mark jobs that disappeared as closed |
| `npm run scrape -- stripe ramp` | Only these company slugs |
| `npm run scrape -- --demo` | Offline: fictional companies with generated data in each ATS's real response format |
| `npm run scrape -- --demo-if-empty` | Live, but loads the sample data if no jobs could be fetched at all |
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
