# JobScout

JobScout collects job openings straight from company careers pages into one searchable feed. It also sends email alerts when new jobs match a saved search.

Most companies host their careers page on an applicant tracking system (ATS) with a public JSON job-board API, and JobScout reads those APIs directly. For any other careers site, it reads the page itself (see [Adding any company by URL](#adding-any-company-by-url)).

| ATS | Endpoint |
|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever | `api.lever.co/v0/postings/{token}?mode=json` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true` |
| Workable | `apply.workable.com/api/v1/widget/accounts/{token}?details=true` |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{token}/postings` |
| Workday | `{tenant}.wdN.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` |

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
| `npm run add-company -- <url> [--name "Acme"]` | Add a company from any careers page URL (see below) |
| `npm run alerts` | Email each confirmed, due alert a digest of jobs first seen since its last email |
| `npm run db:seed` | Re-load `data/companies.json` (or `npm run db:seed -- path/to/list.json`) |
| `npm test` | Adapter, careers-page, normalization and search tests. Fixture sites live in `tests/fixtures/careers`; serve them with `npx tsx tests/fixtures/careers/serve.ts` |

### Scheduling

Run the scraper and then the alerts on a schedule, e.g. with cron:

```cron
0 */6 * * *  cd /srv/jobscout && npm run scrape && npm run alerts
```

Alerts are sent at most once per period (daily/weekly) regardless of how often the job runs.

## Adding any company by URL

All you need is the company's careers page link:

```bash
npm run add-company -- https://acme.com/careers
```

You can also use the **Add a company** box on the Companies page. Either way, JobScout tries these in order:

1. **Known platform in the URL.** Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Workday links (e.g. `acme.wd5.myworkdayjobs.com/External`) use that platform's API.
2. **Known platform embedded in the page.** Many careers pages are a thin wrapper around a Greenhouse or Workday board. If the page embeds or links to one, JobScout switches to that platform's API for future runs.
3. **Structured job data.** Most careers sites publish schema.org `JobPosting` data for Google Jobs. JobScout reads it from the listing page, or follows each job link (up to 150 jobs and 5 listing pages) and reads it there.
4. **Reading the job pages.** If there's no structured data, it takes the title, location and description from each job page's HTML.
5. **Loading it in a browser.** If none of that finds any jobs (the page builds its job list with JavaScript), JobScout loads the page in a headless Chromium and tries again. The first time this is needed, it downloads the browser (about 150 MB, one time).

A company is only saved if jobs were found. The Companies page shows how each company is read ("via Workday", "via careers page"). JobScout respects `robots.txt` on careers sites and identifies itself in its User-Agent.

**Tips if a page finds no jobs:** use the page that lists *all* openings (not the "Life at Acme" page), or the company's Greenhouse/Lever/Workday board link if it has one.

### Company list file

`data/companies.json` accepts either form; run `npm run db:seed` after editing:

```json
{ "name": "Acme", "url": "https://acme.com/careers" }
{ "name": "Acme", "ats": "greenhouse", "token": "acme" }
```

For platform entries, the token is the board name in the careers URL: `boards.greenhouse.io/<token>`, `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`, `apply.workable.com/<token>`, `jobs.smartrecruiters.com/<token>`; for Workday, `<tenant>.wdN/<site>` from `<tenant>.wdN.myworkdayjobs.com/<site>`. The bundled list is a starting point and hasn't been checked against the live APIs. A company whose entry is wrong fails on its own: the error is stored in `Company.lastError` and printed in the scrape summary.

### Settings

| Variable | Default | Meaning |
|---|---|---|
| `ALLOW_ADD_COMPANY` | on | Set to `0` to hide the Add a company form and disable `POST /api/companies`. **Do this if you host JobScout publicly**, since adding a company makes your server fetch the URL. |
| `CHROMIUM_PATH` | — | Use an existing Chrome/Chromium instead of downloading one |
| `ALLOW_PRIVATE_URLS` | off | Allow adding URLs on private/local networks (blocked by default; useful for testing) |

## Email

Without `SMTP_HOST`, emails are written as `.eml` files to `./outbox`, which is handy in development. Set the `SMTP_*` variables in `.env` to send real email. Alerts use double opt-in: a confirmation link, then digests, and every email has an unsubscribe link.

## API

`GET /api/jobs` takes the same query params as the feed and returns JSON. The params are `q`, `location`, `remote=1`, `department`, `company` (slug), `seniority`, `minSalary`, `posted=24h|7d|30d`, `sort=newest|salary` and `page`.

## Layout

```
src/lib/ats/        one adapter per job platform (incl. Workday)
src/lib/careers/    any careers URL: platform detection, JSON-LD, link following, robots.txt, headless rendering
src/lib/http        HTTP client: retries, timeouts, size cap, per-host limits, private-address guard
src/lib/normalize   html→text, remote/seniority detection, salary parsing
src/lib/search      filter parsing + Prisma query building (shared by UI, API and alerts)
src/lib/scraper     fetch with retry, upsert, close stale jobs
src/lib/alerts      confirmation + digest emails
scripts/            scrape, send-alerts, demo data
```

## Scaling notes

- Search uses SQLite `LIKE`, which is fine for tens of thousands of jobs. Beyond that, move to SQLite FTS5 or Postgres full-text search. Switching to Postgres only takes a change to the `provider` in `prisma/schema.prisma`.
- To grow the company list, you can discover board tokens by crawling the "careers" links on company sites and matching the ATS URL patterns above.
