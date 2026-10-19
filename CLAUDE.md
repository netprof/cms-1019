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

## Gotchas

- Source files contain Chinese UI text and must stay UTF-8. In Windows PowerShell 5.1, `Get-Content`/`Set-Content` without `-Encoding utf8` corrupts them — use the Edit/Write tools instead.
- Repo is not under git.
