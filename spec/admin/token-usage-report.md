> GitHub issue: [#2](https://github.com/netprof/cms-1019/issues/2)

## Problem Statement

The team uses Claude Code every day across several projects, but nobody can see how many tokens each person spends, on which project, with which model, or what that costs. Usage only exists in each developer's local session transcripts, so there is no way to budget, spot runaway sessions, or compare models. There is no database table for this data today.

## Solution

Every Claude Code session reports its own token consumption to the CMS API automatically when it ends. A user-level `SessionEnd` hook on each developer machine reads the session transcript, totals token usage per Taipei-time date and model, and posts it to the API. The API validates the report, prices it from a maintained model price list, and stores it so that re-sending the same session never double counts. Admins see a read-only Token Usage report in the CMS, aggregated by user, date, project and model, and maintain model prices on a standard admin page.

## User Stories

1. As a developer, I want my token usage reported automatically when a Claude Code session ends, so that I never have to log usage by hand.
2. As a developer, I want the hook installed once at user level, so that every project I work in is reported, not just the CMS repo.
3. As a developer, I want a single config file holding the API URL, API key and my CMS user ID, so that setup is one step.
4. As a developer, I want the hook to skip silently (with one log line) when the config is incomplete, so that a missing setting never breaks or slows my session.
5. As a developer, I want the hook to give up on the API after 5 seconds, so that ending a session is never noticeably delayed.
6. As a developer, I want a failed report saved to a local spool and re-sent at my next session end, so that usage is not lost when the API is down.
7. As a developer, I want resuming a session (`claude --resume`) to update that session's figures instead of adding them again, so that totals stay correct.
8. As a developer, I want tokens spent by subagents counted in my session, so that the report reflects everything the session consumed.
9. As a developer, I want each message counted on its own Taipei date, so that a session running past midnight is split correctly across both days.
10. As a developer working away from Taipei, I want dates computed with a fixed UTC+8 offset rather than my machine's time zone, so that my usage lands on the same dates as everyone else's.
11. As a developer, I want my project identified by the git remote's `owner/repo`, falling back to the folder name, so that the same repo is one project regardless of where it is cloned.
12. As an admin, I want only reports carrying the shared API key accepted, so that random callers cannot inject data.
13. As an admin, I want reports for unknown or inactive CMS users rejected, so that every usage row belongs to a real, active user.
14. As an admin, I want malformed reports (missing fields, over-length values, negative tokens, future dates, duplicate date/model rows) rejected with a clear 400 message, so that bad data never reaches the table.
15. As an admin, I want input, 5-minute cache write, 1-hour cache write, cache read and output tokens stored separately, so that cost is accurate and cache efficiency is visible.
16. As an admin, I want duplicated transcript lines for the same message counted once and Claude Code's synthetic messages ignored, so that token counts are not inflated.
17. As an admin, I want cost calculated on the server from a price list, so that prices change without redeploying anything to developer machines and clients cannot alter costs.
18. As an admin, I want prices to have an effective date, so that usage is priced at the rate in force on its date.
19. As an admin, I want usage for a model with no price stored with an empty cost rather than rejected, so that a new model never causes lost data.
20. As an admin, I want adding, editing or deleting a model price to recompute the cost of affected usage rows, so that stored costs always match the price list.
21. As an admin, I want current Claude model prices pre-loaded, so that costs are right from day one.
22. As an admin, I want a Model Price page with the standard list and form, so that I can maintain prices like any other admin data.
23. As an admin, I want a Token Usage report page in the admin area, so that I can see consumption without querying the database.
24. As an admin, I want the report aggregated by user, date, project and model, so that it matches how we budget.
25. As an admin, I want to filter the report by date range (defaulting to the 1st of this month through today), user, project and model, so that I can focus on what I need.
26. As an admin, I want each row to show user ID and name, project, model, the five token types, a Token In total and cost, so that I see the full picture on one line.
27. As an admin, I want a totals row for the filtered result, so that I can read overall spend at a glance.
28. As an admin, I want the report paged and sortable, so that large date ranges stay usable.

## Implementation Decisions

- **Data source.** A PowerShell 5.1 script (Windows only) runs as a user-level `SessionEnd` hook. It reads the hook's stdin (`session_id`, `transcript_path`, `cwd`), the main transcript, and the session's subagent transcripts. It deduplicates assistant entries by `message.id`, keeping the largest value of each usage field (a streamed reply's earlier lines can carry a partial `output_tokens`), skips model `<synthetic>`, converts each entry's UTC timestamp to a date at fixed UTC+8, and sums the five token types per (date, model). The script and its install instructions ship in the repo under a tools folder.
- **Hook config.** A per-user JSON file in the Claude config directory holds `apiUrl`, `apiKey` and `userId`. `apiUrl` is `http://localhost:5000` for now. If any value is missing, the hook logs one line and exits successfully.
- **Delivery.** One POST per session with a 5-second timeout. On failure the payload is written to a spool folder in the Claude config directory. Each run re-sends the spooled payloads first and deletes each one after it succeeds. Re-sending is safe because ingestion replaces the whole session. A payload the API rejects with HTTP 400 is moved to the spool's `rejected\` subfolder and logged, never retried; 401 (key) and network failures stay in the spool.
- **Hook seam.** The parsing logic is a pure function from (transcript paths, cwd, session ID, user ID) to the payload object, kept separate from HTTP and spool I/O so it can be tested in isolation.
- **Ingest API contract.** POST body: `{ sessionId, userId, project, rows: [{ date, model, inputTokens, cacheWrite5mTokens, cacheWrite1hTokens, cacheReadTokens, outputTokens }] }`. An empty `rows` clears the session.
- **Ingest authentication.** The `X-Api-Key` header is compared with a key stored in `SysConfig`. A missing or wrong key returns 401. This is the API's first authenticated endpoint; the other endpoints stay anonymous.
- **Ingest validation (400 with messages).**
  - `sessionId`, `userId`, `project` and each row's `model` are required and within column length limits.
  - `userId` must exist in `AppUser` with `IsActive = 1`.
  - Token counts are ≥ 0.
  - `date` is not later than today in Taipei time.
  - No two rows share the same (date, model).
- **Ingest semantics.** In one transaction, delete every `TokenUsage` row for the session, then insert the new rows. This reuses the delete-then-reinsert pattern already used for n-n links.
- **Cost calculation** lives in a C# service, not SQL, so it can be tested through the HTTP seam with fake repositories. Each row's cost is the sum of its tokens times the matching per-million price. The price is the `ModelPrice` row for that model with the latest `EffectiveDate <= UsageDate`. If there is none, cost is NULL.
- **Recompute.** Creating, updating or deleting a `ModelPrice` row recomputes `Cost` for that model's `TokenUsage` rows. After a delete, those rows fall back to an earlier price, or to NULL if none is left.
- **Schema, `TokenUsage` (admin sub-system).**
  - Primary key: (`SessionId nvarchar(100)`, `UsageDate date`, `Model nvarchar(100)`).
  - `UserId nvarchar(200)`, FK to `AppUser`.
  - `Project nvarchar(200)`.
  - `InputTokens`, `CacheWrite5mTokens`, `CacheWrite1hTokens`, `CacheReadTokens`, `OutputTokens` as `bigint`.
  - `Cost decimal(18,6) NULL`.
  - `UpdatedTime datetime`, written as UTC like other server timestamps.
  - Composite key with no `pkid`, like `AppUserRole`.
- **Schema, `ModelPrice` (admin sub-system).**
  - Primary key: (`Model`, `EffectiveDate date`).
  - Five price columns in USD per million tokens: input, 5-minute cache write, 1-hour cache write, cache read, output.
  - Seeded with current Claude 5 family prices taken from official Anthropic pricing at implementation time, not from memory.
- **Report API.** A read-only endpoint aggregates `TokenUsage` joined to `AppUser` by (UserId, UsageDate, Project, Model).
  - Filters: inclusive `DateOnly` from/to range, user, project, model.
  - Paging and sorting follow the existing list endpoints.
  - Returns a totals summary for the whole filtered set alongside the page.
- **Frontend.**
  - A Model Price admin page generated with `/crud`.
  - A hand-written read-only Token Usage report page in the admin area: filter bar, paged sortable table, totals row, no export.
  - Token In total is shown as input + both cache writes + cache read.
- Route names, the `SysConfig` key name and file placement follow the code-gen convention.

## Testing Decisions

- Tests exercise external behaviour only: HTTP requests in, status codes and JSON out, and payload objects out of the hook parser. They never assert on internals such as SQL text or private methods.
- **Backend (existing HTTP seam).** xUnit API tests through `WebApplicationFactory` with in-memory fake repositories, following the existing `*ApiTests` classes and their `Fake*Repository` companions.
  - **Ingest auth:** 401 for a missing or wrong key.
  - **Ingest validation:** each 400 rule.
  - **Replace semantics:** re-posting a session replaces its rows, and a dropped (date, model) disappears.
  - **Cost:** effective-date selection and NULL when no price exists.
  - **Recompute:** price create, update and delete.
  - **Report:** aggregation, filters, totals, paging.
  - **ModelPrice CRUD:** follows the standard `/crud` test set.
- **Hook (new seam).** Pester tests on the transcript-to-payload function, using sample transcripts that contain:
  - duplicate `message.id` lines
  - `<synthetic>` entries
  - messages either side of Taipei midnight
  - multiple models
  - a subagent transcript
  - a cwd with and without a git remote

  HTTP posting and spool handling stay thin and are verified by hand.
- **Frontend.** Component specs per the existing Angular convention.
- **SQL.** Backend tests never hit SQL. Verify the new schema, the ingest transaction, the recompute statements and the report query by hand against the real `CMS` database.

## Out of Scope

- Charts or other visualisations on the report.
- Export (CSV or Excel) of the report.
- Per-user API keys and authentication for the rest of the API.
- Login or identity in the CMS UI; the hook's user ID is self-declared in config.
- macOS and Linux hook support.
- Deploying the API beyond `http://localhost:5000`.
- ~~Backfilling usage from sessions that ended before the hook was installed.~~ Added by the session name extension below (`-Backfill`), for sessions whose transcripts are still on disk.
- Currencies other than USD.
- Prompt-size price tiers. Claude Haiku 5.5 costs more for prompts over 100,000 tokens ($0.50 / $0.625 / $1 / $0.05 / $2.50 per MTok, against $0.10 / $0.125 / $0.20 / $0.01 / $0.50 up to 100K), but `ModelPrice` holds one price set per model and date, and the hook sends usage summed per date and model, which loses the per-reply prompt size the tier depends on. Haiku 5.5 is priced at its ≤100K tier, which under-prices long-prompt replies.

## Extension: session name and session view (2026-10-21)

### User stories

29. As an admin, I want each session's name stored with its usage, so that I can tell sessions apart without reading session IDs.
30. As a developer, I want the name taken from my `/rename` title, or else from the title Claude generated, so that I never have to enter it twice.
31. As an admin, I want a "by session" view of the report, with one row per session showing its name, ID, date range, user, project, models, tokens and cost, so that I can find expensive sessions.
32. As an admin, I want to search sessions by name, so that I can find one session quickly.
33. As a developer, I want to backfill the sessions still in my local transcripts, so that sessions from before the install, or from before names were sent, are reported too.

### Decisions

- **Storage.** `TokenUsage.SessionName nvarchar(200) NULL` holds the name, repeated on every row of the session. No separate session table: the session is replaced as a whole, so the copies cannot disagree. Existing databases get the column from an idempotent upgrade script.
- **Source (hook).** The name is the last `custom-title` entry (`/rename`). Without one it is the last `ai-title` entry, and without either it is `null`. Only the main transcript counts; subagent titles are ignored. The hook cuts the name to 200 characters, so a long title never gets the whole session rejected.
- **Ingest.** `sessionName` is optional, so older hooks keep working.
  - Over 200 characters → 400.
  - Trimmed; a blank name is stored as `NULL`.
  - A post without a name keeps the stored name, read before the delete in the same transaction. A post with a new name replaces it.
- **Session report.** `POST /api/tokenusages/report/sessions` returns one row per session.
  - It uses the same filters as the summary report, plus a `sessionName` contains filter.
  - Filters apply to the rows before summing.
  - The date column shows first ~ last date. The models column lists the distinct models, sorted and comma-joined.
  - Default sort: last date, newest first.
  - Totals and server-side paging work as in the summary report.
- **UI.** A summary / session toggle on the same page.
  - Each mode remembers its own filters, sort and page.
  - The session-name filter appears only in session mode.
- **Backfill.** Running `TokenUsageHook.ps1 -Backfill` by hand posts every local main transcript with its subagents.
  - It skips sessions with no usage, so nothing stored is ever cleared.
  - It shares the hook's config, spool and log.
  - After the first unreachable attempt it spools the rest without sending.
- **Project for an old transcript.** If the cwd no longer exists (for example, a removed worktree), git is asked from the nearest existing parent folder.

## Extension: pivot (2026-10-21)

GitHub issue: [#10](https://github.com/netprof/cms-1019/issues/10)

### User stories

34. As an admin, I want to pick a row dimension, an optional column dimension and a measure, so that I can cross any two of user, project, model and date (for example cost per user per month).
35. As an admin, I want dates grouped by day, ISO week or month, so that long ranges stay readable.
36. As an admin, I want row, column and grand totals, so that I can read shares at a glance.
37. As an admin, I want to switch the measure and re-sort without waiting for the server, so that I can compare cost and tokens quickly.

### Decisions

- **Place.** A third mode 樞紐 on `/token-usages`, sharing the filter bar (date range, user, project, model). No session dimension: the session mode covers sessions.
- **Built in-house**, not a third-party pivot grid: one dimension per axis, a PrimeNG table, no new dependency.
- **API.** `POST /api/tokenusages/report/pivot` takes the filters plus `rowDim`, `colDim` (nullable) and `dateGrain`.
  - It re-groups the summary report's repository rows in C#, so there is no new SQL. Grain and ISO week (Monday start, on Taipei `UsageDate`) are computed in C#.
  - Every cell carries every measure, plus row, column and grand totals. Cost keeps the report rule (NULL-ignoring sum; NULL only when nothing is priced).
  - 400: a dimension outside `user|project|model|date`; the same dimension on both axes; a grain outside `day|week|month` when an axis is date; `from > to`.
- **Labels.** User: name, with the UserId as tooltip. Day `2026-10-21`, week `2026-W43` (tooltip Monday ~ Sunday), month `2026-10`. A week or month partly outside the range counts only its in-range rows, unmarked.
- **UI.**
  - 列 / 欄 / 顆粒度 / 量值 selects under the filter bar; 顆粒度 only while an axis is date; changes apply at once. Row and column options exclude each other; 欄 can be 無.
  - Default: user × month, cost.
  - Measure and sort stay on the client; dimensions, grain and filters re-query.
  - Rows by total desc (by date asc when the rows are dates); columns by date asc, otherwise by total desc. A header click sorts the rows by that column.
  - No paging and no column cap: the row header and the 合計 column are frozen while the table scrolls sideways.
  - Empty cells and NULL cost are blank; numbers formatted like the other modes.
  - State: `tokenusage-pivot-filters` and `tokenusage-pivot-config`; the date range follows the report's saving rule.
- **Access** unchanged. **Out of scope:** session dimension, export, heat-map shading, more than one dimension per axis.

## Further Notes

- Re-sending is idempotent by design: the session is the unit of replacement, so spool retries and `--resume` re-reports are both safe.
- Developers can still impersonate one another with the shared key. That risk was accepted for now.
- Server-side "today" for the future-date check must also use Taipei time (UTC+8), because the server has no time-zone handling today.
