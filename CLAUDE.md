# CMS

Full-stack app on an existing SQL Server schema (`database\*.sql`, DB `CMS` on `.\SQLEXPRESS`): .NET 9 Web API in `src\CMS.API` (Dapper, no EF) + Angular 20 / PrimeNG 20 standalone in `src\CMS.NG`. Git: `main` is stable, work goes on `develop`.

## Read before

- **Adding or changing a feature**: `spec\code-gen.convention.md` (scaffolding, endpoints, auth), `docs\patterns.md` (recipes, test setup), `docs\features.md` (one entry per shipped feature; append one when a feature ships).
- **Smoke-testing or a tooling snag**: `docs\gotchas.md`.

## Commands

```powershell
# API on :5000 (+ /swagger); set ASPNETCORE_ENVIRONMENT=Development first
cd src; dotnet run --project CMS.API --no-launch-profile --urls http://localhost:5000
# -c Release: a running dev server locks bin\Debug
cd src; dotnet test CMS.slnx -c Release
# UI on :4200
cd src\CMS.NG; npx ng serve
cd src\CMS.NG; npx ng test --watch=false --browsers=ChromeHeadless
cd src\CMS.NG; npx ng build
```

## Always-on rules

- Backend tests run on in-memory fakes (sole exception: `RowAuditRepositoryDbTests`); check every new SQL statement against the real DB.
- Source files hold Chinese UI text: write them as UTF-8 with the Edit/Write tools (PowerShell 5.1 `Get-Content`/`Set-Content` need `-Encoding utf8`).
- Files use LF; Git's CRLF warnings on Windows are harmless.

## Agent skills

- Issue tracker: GitHub Issues (`netprof/cms-1019`) via `gh`, see `docs/agents/issue-tracker.md`.
- Triage labels: `docs/agents/triage-labels.md`.
- Domain docs: single-context, root `GLOSSARY.md` + `docs/adr/` (created lazily), see `docs/agents/domain.md`.
