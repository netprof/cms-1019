# CMS

Full-stack app built on the existing SQL Server schema. Backend is a .NET 9 Web API (Dapper), frontend is Angular 20 with PrimeNG.

## Layout

| Path | Purpose |
|------|---------|
| `database\*.sql` | Source of truth for the DB schema (database `CMS` on `.\SQLEXPRESS`) |
| `spec\code-gen.convention.md` | Coding conventions — follow when adding a feature |
| `spec\ui-sample-*.png` | UI style references only (not actual content) |
| `spec\*.spec.md` | Feature spec template and samples |
| `src\CMS.API\` | Backend, .NET 9 Web API |
| `src\CMS.API.Tests\` | xUnit tests for the API |
| `src\CMS.NG\` | Frontend, Angular 20 |
| `src\CMS.slnx` | Solution (API + tests) |

## Commands

```powershell
# Backend (http://localhost:5000, Swagger at /swagger)
cd src; dotnet run --project CMS.API --no-launch-profile --urls http://localhost:5000
cd src; dotnet test CMS.slnx

# Frontend (http://localhost:4200)
cd src\CMS.NG; npx ng serve
cd src\CMS.NG; npx ng test --watch=false --browsers=ChromeHeadless
cd src\CMS.NG; npx ng build
```

Run the backend with `ASPNETCORE_ENVIRONMENT=Development` (the launch profile sets it; `--no-launch-profile` does not).

## Backend (`src\CMS.API`)

- Dapper only — no Entity Framework. All controllers/repositories are async.
- Connection string `ConnectionStrings:Default` in `appsettings.json`; connections come from `IDbConnectionFactory`.
- CORS allows any loopback origin. `Program.cs` also registers Dapper `DateOnly`/`TimeOnly` type handlers.
- Per table `{T}`: `Models/{T}.cs` (response), `{T}Request.cs` (write DTO), `{T}Query.cs` (search DTO); `Repositories/I{T}Repository.cs` + `{T}Repository.cs`; `Controllers/{T}sController.cs` at `/api/{plural}`.
- Endpoints per convention: `GET /`, `POST /query`, `GET /{id}`, `POST /`, `PUT /` (key in body), `DELETE /{id}`; FK-target lists go under `/api/lookups/{plural}`.
- Quirks: `AppRole`'s primary key is the string `RoleId` (the `pkid` identity column is not the key), so routes take `{id}` with no `:int`. `nchar` columns need `RTRIM()` in SELECTs. n-n links are delete-then-reinsert in a transaction.
- `Program` is `public partial` so tests can use `WebApplicationFactory<Program>`.
- `DELETE` on a row referenced by an FK: map SQL error 547 to 409. If a child FK is `ON DELETE CASCADE` (check `database\*.sql`), SQL will not raise 547 — it silently deletes the children — so add an `IsInUseAsync(pkid)` repository check (`EXISTS` over every referencing table) and return 409 **before** issuing the delete. Keep the 547 mapping as a backstop. Precedent: `CourseGroup`.
- Code/lookup tables with no `DisplayOrder` column sort by `pkid ASC` (`PublishStatus`, `CourseGroup`); tables with `DisplayOrder` sort by `DisplayOrder, pkid`.
- Naming: API routes and lookup routes are lowercase with no hyphen (`/api/coursegroups`, `/api/lookups/coursegroups`); Angular routes and folders are kebab-case (`/course-groups`, `features/course-groups/`); session-storage keys drop the hyphen (`coursegroup-list-filters`).
- Child tables with their own IDENTITY key plus data columns (e.g. `PartnerCourseGroup`) are separate entities with their own CRUD, not n-n multiselects, even when they look like junction tables.

### Backend tests

Tests run the real HTTP pipeline against `FakeAppRoleRepository` (in-memory) — they never hit SQL. Verify new SQL manually against the real DB.

## Frontend (`src\CMS.NG`)

- Standalone components, PrimeNG 20 (`@primeuix/themes`, emerald preset in `core/theme.ts`), no proxy.
- API base URL: `src/environments/environment.ts` (production default); `environment.development.ts` is swapped in for the development build config. Import via the `@env/*` alias (`@app/*` also available).
- Feature layout: `features/{table-plural}/{table}-list|detail|form/`, plus `{table}.model.ts` and `{table}.service.ts`. Routes are lazy-loaded in `app.routes.ts`; `new` must come before `:id`.
- List pages: sortable/paginated `p-table`, filter in `p-drawer`, filters/sort/page saved in session storage under `{table}-list-filters|sort|page`.
- Form pages: Reactive Forms, `forkJoin` for lookups on init, `p-multiselect` for n-n. Edit mode disables the key field, so read it with `getRawValue()`.
- Sidebar entries: add to `navGroups` in `app.ts`.
- Dependency pins: `@angular/animations` ~20.3 and `@angular/cdk` ~20.2 are pinned to satisfy PrimeNG 20.4's peer ranges.

### Frontend tests

Karma + Jasmine (`ng test`). When mocking `ActivatedRoute` in specs, list its provider **after** `provideRouter(...)` or the router's own provider overrides it.

## Features

- **AppRole** (`auth.sql`): list/filter, view, add, edit, delete, with user assignment (n-n via `AppUserRole`). Menu: `系統管理 Admin → 角色 AppRole`.
- **PublishStatus** (`admin.sql`): list/filter, view, add, edit, delete. `pkid` is a user-supplied `tinyint` (not IDENTITY) — `POST` returns 409 on a duplicate and the field is locked in edit mode. `DELETE` maps SQL FK violation 547 to 409 (referenced by `Course`/`Promotion2`). Lookup at `/api/lookups/publishstatuses`. Spec: `spec/admin/PublishStatus.md`. Menu: `系統管理 Admin → 發布狀態 PublishStatus`.
- **Partner** (`course.sql`): list/filter, view, add, edit, delete. `pkid` is `smallint IDENTITY` (C# `short`); the key is shown read-only in edit mode and is not a form control. Blank `ImageFilename` is stored as `NULL`. `DELETE` maps FK violation 547 to 409 (referenced by `Course`/`Certification`/`PartnerCourseGroup`/`Promotion2`). `PartnerCourseGroup` is a child entity, not an n-n multiselect (it has its own identity that `Promotion2` references). Lookup at `/api/lookups/partners`. Spec: `spec/course/Partner.md`. Menu: `課程管理 Course → 合作廠商 Partner`.
- **CourseGroup** (`course.sql`): list/filter, view, add, edit, delete. `pkid` is `smallint IDENTITY` (C# `short`), one `Description` column. `FK_Course_CourseGroup` is `ON DELETE CASCADE`, so `DELETE` first calls `IsInUseAsync` (Course / PartnerCourseGroup) and returns 409 before issuing the delete; SQL 547 is also mapped to 409. Lookup at `/api/lookups/coursegroups`. Spec: `spec/course/CourseGroup.md`. Menu: `課程管理 Course → 課程群組 CourseGroup`.
- **Course** (`course.sql`): list/filter, view, add, edit, delete. FKs to Partner / CourseGroup (nullable) / PublishStatus are returned as nav objects (`partner`, `courseGroup`, `publishStatus`) via Dapper multi-map, alongside the raw pkids. Two n-n links (`CourseInCertification`, `CourseJobCategories`) use delete-then-reinsert in the same transaction; lookups at `/api/lookups/certifications` (`RTRIM` on `nchar` Title) and `/api/lookups/jobcategories` live on `ICourseRepository` since those entities have no feature yet. `ScheduleOff < ScheduleOn` → 400. `DELETE` maps 547 to 409 (CourseFAQ / CourseRelatedLink / HotCourse). The list accepts `?partnerPkid=`, `?courseGroupPkid=`, `?publishStatusPkid=` (override saved filters); Partner / CourseGroup / PublishStatus list and detail pages have a 查看課程 button. Date helpers in `core/utils/date.util.ts`. Spec: `spec/course/Course.md`. Menu: `課程管理 Course → 課程 Course`.

## Gotchas

- Source files contain Chinese UI text and must stay UTF-8. In Windows PowerShell 5.1, `Get-Content`/`Set-Content` without `-Encoding utf8` corrupts them — use the Edit/Write tools instead.
- Git: `main` is the stable branch; day-to-day work goes on `develop`. Files use LF; Git warns about CRLF conversion on Windows, which is harmless.
- A running `dotnet run` dev server locks `bin\Debug`, so `dotnet test` fails with a file-lock error. Stop the server first, or run `dotnet test CMS.slnx -c Release`.
- To smoke-test new SQL without stopping the user's dev server on 5000: after `dotnet test -c Release`, `cd src\CMS.API\bin\Release\net9.0` and run `dotnet CMS.API.dll --urls http://localhost:5001` (it must be run from that folder or `appsettings.json` is not found). The server on 5000 keeps running the old build until restarted.
- Git Bash `curl` corrupts Chinese characters in JSON bodies (the API returns 400 "JSON value could not be converted"). Use ASCII values for smoke tests, or call the API from PowerShell.
- `ng build` warns that the initial bundle exceeds the 500 kB `maximumWarning` budget in `angular.json` (about 517 kB after Course; the `maximumError` is 1 MB). This is a warning only; raise `maximumWarning` when it becomes noise.
- The `/crud` skill writes the spec to `spec/{sub-system}/{Table}.md` first; if that file already exists it skips spec generation and builds from it, so edit the spec and re-run `/crud` to change a design decision.
