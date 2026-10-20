# Shipped features

One entry per feature. Append an entry when a feature ships (the `/crud` skill's finish step does this). Keep each entry to the facts that are not obvious from the code: key type quirks, FK/delete behaviour, lookup route, spec path, menu entry.

## AppUser (`auth.sql`)

List/filter, view, add, edit, delete, reset-password, with role assignment (n-n via `AppUserRole`, mirror of AppRole's user list). String PK `UserId` (routes take `{id}` with no `:int`; `pkid` is a read-only surrogate).

- `PasswordHash` is backend-only: absent from `AppUser`/`AppUserRequest`/Angular models and never selected.
- `POST` sets it to `PasswordHasher.Sha256Hex(default)` where the default comes from `SysConfig` row `appConfig` (JSON property `defaultPassword`, read by `GetDefaultPasswordAsync`; missing → 500). `PUT` never touches it. `POST /api/appusers/{id}/reset-password` resets it to the default and stamps `PasswordUpdatedTime` (UTC).
- Hash format is lowercase hex SHA-256 of the UTF-8 password (verified against the seeded row).
- Filters: keyword, `IsActive` tri-state, `RoleId` (EXISTS on junction), `PasswordUpdatedFrom/To` (`DateOnly`, inclusive).
- Lookup: `/api/lookups/approles`. Spec: `spec/auth/AppUser.md`. Menu: `系統管理 Admin → 使用者 AppUser`.

## AppRole (`auth.sql`)

List/filter, view, add, edit, delete, with user assignment (n-n via `AppUserRole`). Primary key is the string `RoleId` (the `pkid` identity column is not the key), so routes take `{id}` with no `:int`. Menu: `系統管理 Admin → 角色 AppRole`.

## PublishStatus (`admin.sql`)

List/filter, view, add, edit, delete. `pkid` is a user-supplied `tinyint` (not IDENTITY): `POST` returns 409 on a duplicate and the field is locked in edit mode. `DELETE` maps SQL FK violation 547 to 409 (referenced by `Course`/`Promotion2`). Sorts by `pkid ASC`. Lookup: `/api/lookups/publishstatuses`. Spec: `spec/admin/PublishStatus.md`. Menu: `系統管理 Admin → 發布狀態 PublishStatus`.

## Partner (`course.sql`)

List/filter, view, add, edit, delete. `pkid` is `smallint IDENTITY` (C# `short`); the key is shown read-only in edit mode and is not a form control. Blank `ImageFilename` is stored as `NULL`. `DELETE` maps 547 to 409 (referenced by `Course`/`Certification`/`PartnerCourseGroup`/`Promotion2`). `PartnerCourseGroup` is a child entity, not an n-n multiselect (it has its own identity that `Promotion2` references). Lookup: `/api/lookups/partners`. Spec: `spec/course/Partner.md`. Menu: `課程管理 Course → 合作廠商 Partner`.

## CourseGroup (`course.sql`)

List/filter, view, add, edit, delete. `pkid` is `smallint IDENTITY` (C# `short`), one `Description` column. `FK_Course_CourseGroup` is `ON DELETE CASCADE`, so `DELETE` first calls `IsInUseAsync` (Course / PartnerCourseGroup) and returns 409 before issuing the delete; SQL 547 is also mapped to 409. Sorts by `pkid ASC`. Lookup: `/api/lookups/coursegroups`. Spec: `spec/course/CourseGroup.md`. Menu: `課程管理 Course → 課程群組 CourseGroup`.

## Course (`course.sql`)

List/filter, view, add, edit, delete.

- FKs to Partner / CourseGroup (nullable) / PublishStatus are returned as nav objects (`partner`, `courseGroup`, `publishStatus`) via Dapper multi-map, alongside the raw pkids.
- Two n-n links (`CourseInCertification`, `CourseJobCategories`) use delete-then-reinsert in the same transaction. Their lookups, `/api/lookups/certifications` (`RTRIM` on `nchar` Title) and `/api/lookups/jobcategories`, live on `ICourseRepository` because those entities have no feature yet.
- `ScheduleOff < ScheduleOn` → 400. `DELETE` maps 547 to 409 (CourseFAQ / CourseRelatedLink / HotCourse).
- The list accepts `?partnerPkid=`, `?courseGroupPkid=`, `?publishStatusPkid=` (override saved filters); the Partner / CourseGroup / PublishStatus list and detail pages have a 查看課程 button that deep-links here.
- The detail page's 課程資料 card shows a QR code for `https://www.uuu.com.tw/Course/Show/{pkid}/{CourseId}` (CourseId URL-encoded) with CourseId as its caption. 下載 QR Code saves `{CourseId}.png` with the CourseId drawn above the code. Generated client-side by the `qrcode` npm package (listed in `allowedCommonJsDependencies`, lazy chunk only).
- The list table is editable in place: double-click a cell (single click does nothing) except 主代碼 / 原廠 / 課程群組. It saves on blur (select and date editors also save on option pick / overlay close, and their blur is ignored while the overlay is open); Enter commits, Escape cancels, an unchanged value makes no request. Invalid values show an inline error and keep the editor open. A save shows the value at once, `GET`s the course (list rows have no n-n keys and `PUT` replaces them) and `PUT`s it with that one field changed; on failure the row reverts and a toast shows. The row is locked while its save is in flight. Not a PrimeNG `pEditableColumn`, which opens on single click.
- Date helpers in `core/utils/date.util.ts`. Spec: `spec/course/Course.md`. Menu: `課程管理 Course → 課程 Course`.

## FeaturedPromoItem (`promotion.sql`)

Custom (non-table) page: one tab per `TrainingCenter` (`DisplayOrder, pkid`), a Monday–Sunday week navigator, and 7 days × slots 1–3. Edit / New are an inline form (`featured-promo-item-form`) that replaces the slot row; there are no `/new`, `/:id` or detail routes.

- `POST /query` takes `TrainingCenterPkid` and `WeekOf` (any day; the controller expands it to Monday–Sunday and overwrites `ScheduleOnFrom/To`). Reversed range → 400. Sorts by `ScheduleOn, TrainingCenter_pkid, Slot`.
- `(ScheduleOn, TrainingCenter_pkid, Slot)` is a unique index: `POST`/`PUT` call `IsSlotTakenAsync` first and return 409; SQL 2601/2627 are also mapped to 409, and 547 (unknown promotion/center) to 400. Slot is `[Range(1,3)]`.
- `POST /{id}/move-down` (+, slot 1 → 2) and `/{id}/move-up` (−) swap with the neighbouring slot in one `UPDATE … CASE` statement (the unique index is checked against the final state; verified on SQL Server). Moving past slot 1/3 → 400.
- Promotion is returned as a nav object (`promotion.promoCode/topic/description`). The form's PromoCode field is a `p-autocomplete` over `GET /api/lookups/promotions?keyword=` (contains, newest first, `TOP 20` — Promotion2 has 1000+ rows); picking one sets `promotionPkid` and copies its Topic/Description into the form.
- Copy / Paste is client-side only (a signal on the list page); Paste opens a New form pre-filled with the copied values. The saved tab and week live in `featuredpromoitem-list-filters`.
- Lookups `/api/lookups/trainingcenters` and `/api/lookups/promotions` live on `IFeaturedPromoItemRepository` (no TrainingCenter / Promotion2 feature yet). Week helpers `mondayOf` / `addDays` are in `core/utils/date.util.ts`. Spec: `spec/custom/FeaturedPromoItem/FeaturedPromoItem.spec.md`. Menu: `首頁 Home → 上稿作業 FeaturedPromoItem`.

## ModelPrice (`admin.sql`)

List/filter, view, add, edit, delete of Claude model prices: five USD-per-million-token rates (input, 5-minute cache write, 1-hour cache write, cache read, output) as `decimal(18,6)`.

- Composite key (`Model nvarchar(100)`, `EffectiveDate date`), no `pkid`. Routes are `/api/modelprices/{model}/{yyyy-MM-dd}` and `/model-prices/:model/:date[/edit]`; the Angular service `encodeURIComponent`s the model. `POST` returns 409 on a duplicate key (also maps SQL 2627); both key fields are locked in edit mode.
- Prices are validated `>= 0` with `[Range(typeof(decimal), …)]`, because `[Range(int, int)]` truncates `-0.01` to 0 and accepts it.
- No FKs and no lookup endpoint; `TokenUsage.Model` matches by value. Sorts by `Model, EffectiveDate DESC`. Filters: keyword (Model), `EffectiveDateFrom/To` (inclusive).
- Seeded in `admin.sql` with the Claude 5 family (`claude-fable-5-1`, `claude-fable-5`, `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-5-5`), effective `2026-01-01`, from the official pricing page as read 2026-10-20 (re-checked the same day; note Fable 5.1 cache reads are $0.25 against Fable 5's $1, and Sonnet 5.5's are $0.10). Haiku 5.5 is seeded at its ≤100K-token prompt tier only: its >100K tier ($0.50 / $0.625 / $1 / $0.05 / $2.50) is not modelled (one price set per model and date, and ingested usage is summed per day, so the prompt size is lost), so long-prompt Haiku 5.5 usage is under-priced. Out of scope in the TokenUsage spec.
- Create, update and delete recompute that model's `TokenUsage.Cost` (see TokenUsage pricing below) in the same transaction as the price write (`DbTransactionScope`), so a failed recompute rolls the price change back (verified on SQL Server). Spec: `spec/admin/ModelPrice.md`. Menu: `系統管理 Admin → 模型價格 ModelPrice`.

## TokenUsage ingest (`admin.sql`)

API (the admin UI is the TokenUsage report below): `POST /api/tokenusages` receives one Claude Code session's usage `{ sessionId, userId, project, rows: [{ date, model, inputTokens, cacheWrite5mTokens, cacheWrite1hTokens, cacheReadTokens, outputTokens }] }` from the SessionEnd hook and returns 204.

- Composite PK `(SessionId, UsageDate, Model)`, no `pkid`; FK `UserId` → `AppUser`. `UsageDate` is a Taipei (UTC+8) date; `UpdatedTime` is UTC.
- First authenticated endpoint: `X-Api-Key` must equal SysConfig row `tokenUsageConfig` (JSON property `apiKey`, read by `IIngestApiKeyReader`). The check is the `[RequireIngestApiKey]` authorization filter, so a bad key is 401 before model validation. A missing row or `apiKey` is also 401 (logged as a warning), not 500. All other endpoints stay anonymous.
- 400 (`ValidationProblem`): required / over-length `sessionId` (100), `userId` (200), `project` (200), `model` (100); unknown or inactive user (`IAppUserRepository.IsActiveUserAsync`); negative tokens; `date` after today in Taipei (clock via injected `TimeProvider`, fixed +8 offset); duplicate (date, model). Text is trimmed and model duplicates are compared with `SqlCollation.Comparer`, matching SQL Server key comparison.
- `ReplaceSessionAsync` deletes the session's rows and inserts the new ones in one transaction (verified: a failing insert rolls the delete back). Re-posting replaces; empty `rows` clears the session.
- `Cost` is priced on ingest; see TokenUsage pricing.
- Client: `tools/token-usage/TokenUsageHook.ps1` (PowerShell 5.1 SessionEnd hook; Pester 3.4 tests and install steps in `tools/token-usage/README.md`). Dedupes by `message.id`, keeping the largest value of each usage field (a streamed reply's earlier content-block lines carry a partial `output_tokens`; in real transcripts the last line holds the full count). Skips `<synthetic>`, includes `<session>/subagents/*.jsonl`, project = git remote `owner/repo` or folder name. Failed posts are spooled and re-sent at the next session end; an HTTP 400 moves the payload to the spool's `rejected\` folder (never retried), while 401 and network failures stay in the spool.
- Spec: `spec/admin/token-usage-report.md` (GitHub issue #2).

## TokenUsage pricing

`TokenUsage.Cost` (USD, `decimal(18,6)`) = Σ tokens × per-million price over the five token types, rounded to 6 decimals. The price is the `ModelPrice` row for that model with the latest `EffectiveDate <= UsageDate`; with none, `Cost` is `NULL` and the row is still stored.

- Logic is in C#, not SQL: `Services/TokenCostService` (scoped). `PriceAsync(rows)` is called by the ingest endpoint before `ReplaceSessionAsync`; `RecomputeModelAsync(model)` is called after a successful `ModelPrice` create, update or delete, so a delete falls back to an earlier price or to `NULL`.
- Recompute reads every row of the model (`ITokenUsageRepository.GetByModelAsync`) and writes costs back by key (`UpdateCostsAsync`), inside the `ModelPrice` write's transaction. `UpdatedTime` is not touched: it stays the ingest time. Model matching uses `SqlCollation.Comparer` (case-insensitive, like SQL Server).
- Spec: `spec/admin/token-usage-report.md`.

## TokenUsage report (`admin.sql`)

Read-only report page `/token-usages` (hand-written, not `/crud`): filter bar, server-paged sortable table, totals row, no export and no add/edit/delete. Menu: `系統管理 Admin → 用量報表 TokenUsage`.

- `POST /api/tokenusages/report` (anonymous, unlike ingest) takes `{ from, to, userId, project, model, first, rows, sortField, sortOrder }` and returns `{ items, totalRecords, totals }`. Rows are `TokenUsage` summed by `(UserId, UsageDate, Project, Model)` and joined to `AppUser` for `userName`.
- Filters: `from`/`to` are `DateOnly`, inclusive (`from > to` → 400); `userId` exact (p-select over `/api/lookups/appusers`); `project` and `model` contains.
- Unlike the other lists, paging and sorting are server-side (PrimeNG `[lazy]` table): the repository returns every aggregated row of the filtered set and the controller sorts, pages (`first` ≥ 0, `rows` 1–500) and totals in memory. `sortField` is whitelisted to the camelCase column names (unknown → 400), `sortOrder` is 1/-1; ties break by date desc, user, project, model. Default: `usageDate` desc, 20 rows.
- `tokenIn` = input + both cache writes + cache read (computed by the API, on rows and totals). `cost` is `SUM(Cost)`, which ignores unpriced rows and is `NULL` only when nothing in the group (or the whole set) is priced; the page shows `NULL` as blank.
- The page's date range defaults to the 1st of this month through today in Taipei dates (`taipeiToday()` in `core/utils/date.util.ts`, whatever the browser's time zone); 清除 restores that. Filters/sort/page persist in `tokenusage-report-filters` / `-sort` / `-page`, but the date range is saved only when it differs from the default, so an untouched default follows today across midnight.
- Report SQL verified against the real `CMS` DB (aggregation across sessions, NULL-ignoring cost sum, inclusive range, contains filters, empty result). Spec: `spec/admin/token-usage-report.md`.

## Login (`auth.sql`)

`POST /api/auth/login` (`AuthController`, anonymous) takes `{ userId, password }` and returns `{ userId, userName, accessToken }`. The Angular login page and how the token is used are under Authorization below.

- Checks: `AppUser.UserId` matches exactly (fetched by the CI collation, then compared `Ordinal` in C#, so `ADMIN` ≠ `admin`), `IsActive = 1`, and `PasswordHash` equals `PasswordHasher.Sha256Hex(password)` (constant-time compare). Every failure, including an empty field, is the same `401 { "message": "invalid credentials" }`.
- Token: HS256 JWT built by `Services/JwtTokenService` (`Microsoft.IdentityModel.JsonWebTokens`), signed with SysConfig `appConfig.symmetricSecurityKey` read on every login (`IAuthRepository.GetJwtSigningKeyAsync`; missing → 500). Claims: `sub` = UserId, `name` = UserName, `role` = every `AppUserRole.RoleId` (always a JSON array). `iat`/`nbf` = now via `TimeProvider`, `exp` = now + 24h. No `iss`/`aud`.
- `PasswordHash` is read only into the internal `LoginCredential` model; `LoginResponse` has no such field.
- Verified against the real `CMS` DB (valid login, wrong password, unknown user, case mismatch).

## Authorization (JWT, end to end)

Every API endpoint requires `Authorization: Bearer <token from /api/auth/login>` except `POST /api/auth/login` and the token usage ingest (`POST /api/tokenusages`, which the SessionEnd hook calls with its `X-Api-Key` and no JWT). No role-based restrictions on the API yet: any valid token reaches every endpoint.

- Backend: `AddJwtBearer` + `app.MapControllers().RequireAuthorization()`; anonymous actions carry `[AllowAnonymous]`. Validation: HS256 signature and lifetime only (no `iss`/`aud`), `MapInboundClaims = false`, so `User` sees `sub`, `name` and `role` as issued. No token, a bad signature, an expired token or another scheme → 401 with `WWW-Authenticate: Bearer`.
- Validation key: `Services/SysConfigSigningKeyManager` is the bearer handler's `ConfigurationManager` (the async hook for signing keys). It reads SysConfig `appConfig.symmetricSecurityKey` through `IAuthRepository` (the same key `JwtTokenService` signs with), caches it 5 minutes, and re-reads at once when a token's key is not found, so a rotated key takes effect on the next request. A missing key is logged as a warning and every token gets 401, not 500.
- `AuthorizationApiTests.EveryAction_RequiresAuthorization_ExceptLoginAndTokenUsageIngest` lists the anonymous actions; update it when adding a public endpoint on purpose. Swagger UI has an Authorize button (bearer scheme).
- Frontend: `/login` page (`features/auth/login`) is the only public route; everything else is a child of `{ path: '', canActivateChild: [authGuard] }`, which sends visitors without a token to `/login?returnUrl=…` (same-app paths only). `core/auth/AuthService` stores the login response as JSON in **session storage** key `cms-auth` and reads the `role` claim(s) from the token payload (no API call). `authInterceptor` adds the Bearer header to requests under `environment.apiBaseUrl`; a 401 from any API call other than login runs `logout(currentUrl)`.
- Logout (and a 401) clears **all** session storage, saved list filters included, then goes to `/login`. The shell (sidebar + header with UserName and 登出) renders only while signed in.
- Sidebar: the `系統管理 Admin` group has `adminOnly: true` and shows only when the roles include `Admin` (exact case). Hiding the menu is not access control: a non-admin can still open admin URLs, and the default route `/` still redirects to `/app-roles`.
- Verified against the real `CMS` DB: no token / garbage token → 401, login token → 200 on `/api/approles` and `/api/courses`, ingest still answered by its API-key filter.
