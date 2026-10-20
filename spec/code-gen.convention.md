# Code Generation Patterns

Scaffolding rules for a feature on table `{T}`. Design recipes for special cases (FK deletes, string keys, server-controlled columns, n-n vs child tables, …) are in `docs\patterns.md`.

## Naming

| Thing | Form | Example |
|-------|------|---------|
| API and lookup routes | lowercase, no hyphen | `/api/coursegroups`, `/api/lookups/coursegroups` |
| Angular routes and folders | kebab-case | `/course-groups`, `features/course-groups/` |
| Session-storage keys | no hyphen | `coursegroup-list-filters` |

## Backend (`src\CMS.API`)

- .NET 9 Web API, Dapper only (no EF); every controller/repository method is async. Connections come from `IDbConnectionFactory` (`ConnectionStrings:Default` in `appsettings.json`).
- `Program` is `public partial` (tests use `WebApplicationFactory<Program>`), registers the Dapper `DateOnly`/`TimeOnly` handlers, and allows CORS from any loopback origin.
- Every controller requires a JWT bearer token through the global `MapControllers().RequireAuthorization()`, so a plain authenticated endpoint needs no attribute. Role-restricted actions add `[Authorize(Roles = AuthController.AdminRole)]` (today: `AuthController.ResetPassword`, 403 for others); public actions add `[AllowAnonymous]` (today: `AuthController.Login`, token usage ingest). See `docs\features.md` → Authorization.

### Models
- `Models/{T}.cs` — response model (nav objects for FKs, subquery counts for n-n)
- `Models/{T}Request.cs` — write DTO (FK pkids only; n-n as `List<int>`)
- `Models/{T}Query.cs` — search DTO (Keyword?, FK pkids?, bool fields?, date ranges?)
- Server-controlled columns never appear in DTOs or Angular models; server-written `datetime` uses `DateTime.UtcNow`.

### Repository
- `Repositories/I{T}Repository.cs` + `{T}Repository.cs`
- Multi-map when JOINing nav objects.
- `nchar` columns: always `RTRIM()` in SELECTs.
- n-n: delete-then-reinsert in one transaction on update; separate query on the same connection for reads.
- Create / Update / Delete write a `RowAudit` row via `RowAuditWriter` in the same `DbTransactionScope` (not `BeginTransaction()`): see `docs\patterns.md` → Row audit on every write.

### Controller
- `Controllers/{T}sController.cs` at `/api/{plural}`; `PUT` takes the key from the body (no route param).
- String PKs: route `{id}` (no `:int` constraint); the Angular service uses `encodeURIComponent`.
- `DELETE` of a row referenced by an FK returns 409: map SQL error 547, and for `ON DELETE CASCADE` children check `IsInUseAsync` first.

### Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/{plural}` | All records |
| POST   | `/api/{plural}/query` | Filtered search |
| GET    | `/api/{plural}/{id}` | Single record |
| POST   | `/api/{plural}` | Create |
| PUT    | `/api/{plural}` | Update (key in body) |
| DELETE | `/api/{plural}/{id}` | Delete |
| GET    | `/api/lookups/{plural}` | Slim lookup list (if used as FK target) |

### Tests (`src\CMS.API.Tests`)
- xUnit over the real HTTP pipeline with an in-memory fake repository; never hits SQL, so verify new SQL manually against the real DB.

## Frontend (`src\CMS.NG`)

- Angular 20 standalone components, PrimeNG 20 (`@primeuix/themes`, emerald preset in `core/theme.ts`), no proxy.
- API base URL from `src/environments/environment.ts` (`environment.development.ts` swapped in for dev builds); import via `@env/*` (`@app/*` also available).

### Files
- `features/{table-plural}/{table}-list/`, `{table}-detail/`, `{table}-form/`, plus `{table}.model.ts` and `{table}.service.ts`
- Routes lazy-loaded in `app.routes.ts`; `new` must come before `:id`.
- Sidebar entry under the right group in `navGroups` in `app.ts`.

### List page
- Sortable/paginated `p-table`; filters in a `p-drawer`
- Filters/sort/page saved in session storage as `{table}-list-filters`, `{table}-list-sort`, `{table}-list-page`
- `p-select` in drawer: always `appendTo="body"`; mapped `{ pkid, label }[]` getter; `[filter]="true"` for 10+ options
- `p-select` / `p-multiselect` with 100+ items: add `[virtualScroll]="true" [virtualScrollItemSize]="43"`

### Detail and form pages
- First item in the toolbar's `.actions`: `<app-row-audit-badge tableName="{T}" [pkid]="…" />` (`shared/row-audit/row-audit-badge.ts`); pass null until the record is loaded and on New. A custom page that edits many records inline (no detail page) puts a single badge in its page header with `[pkids]` / `[itemLabels]` instead (FeaturedPromoItem). The spec adds `provideRowAuditStub()` and calls `expectRowAuditBadge` / `expectNoRowAuditBadge` (`core/testing/row-audit.ts`) — see `docs\patterns.md` → Row audit on every write

### Form page
- Reactive Forms; `forkJoin` for parallel lookup calls on init
- Edit mode disables the key field, so read the form with `getRawValue()`
- `p-datepicker`: convert ISO string ↔ `Date` on load/save
- `p-datepicker [timeOnly]="true"` for `time` columns; `parseTime`/`toTimeStr` helpers
- `p-multiselect` for n-n: `[maxSelectedLabels]="9999"`; wrap chips via `::ng-deep`
- Save/Cancel toolbar is sticky: `<div class="page-header sticky-toolbar" id="form-toolbar">` (buttons `#save-button`, `#cancel-button`); spec calls `expectStickyToolbar()` for add and edit — see `docs\patterns.md` → Sticky form toolbar

### Tests
- Karma + Jasmine (`ng test`), one `.spec.ts` per component and service.

## Special Types

| Column type | Handling |
|-------------|---------|
| `nchar(n)` | `RTRIM()` in all SQL SELECTs |
| `time(7)` | C# `TimeOnly` via `TimeOnlyTypeHandler`; display with `\| slice:0:5`; `p-datepicker [timeOnly]` in form |
| `date` | C# `DateOnly` via `DateOnlyTypeHandler`; `p-datepicker` in form |
| `smallint` PK | No special handling |
| `nvarchar` PK (string) | Controller route `{id}` (no `:int`); service calls `encodeURIComponent(id)` |
