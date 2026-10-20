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

## TokenUsage ingest (`admin.sql`)

API only (no UI yet): `POST /api/tokenusages` receives one Claude Code session's usage `{ sessionId, userId, project, rows: [{ date, model, inputTokens, cacheWrite5mTokens, cacheWrite1hTokens, cacheReadTokens, outputTokens }] }` from the SessionEnd hook and returns 204.

- Composite PK `(SessionId, UsageDate, Model)`, no `pkid`; FK `UserId` → `AppUser`. `UsageDate` is a Taipei (UTC+8) date; `UpdatedTime` is UTC.
- First authenticated endpoint: `X-Api-Key` must equal SysConfig row `tokenUsageConfig` (JSON property `apiKey`, read by `ITokenUsageRepository.GetIngestApiKeyAsync`; missing → 500). The check is the `[RequireIngestApiKey]` authorization filter, so a bad key is 401 before model validation. All other endpoints stay anonymous.
- 400 (`ValidationProblem`): required / over-length `sessionId` (100), `userId` (200), `project` (200), `model` (100); unknown or inactive user; negative tokens; `date` after today in Taipei (clock via injected `TimeProvider`, fixed +8 offset); duplicate (date, model). Text is trimmed and model duplicates are compared case-insensitively, matching SQL Server key comparison.
- `ReplaceSessionAsync` deletes the session's rows and inserts the new ones in one transaction (verified: a failing insert rolls the delete back). Re-posting replaces; empty `rows` clears the session.
- `Cost` is always `NULL` for now (pricing pending).
