# CMS

Full-stack app on the existing SQL Server schema: .NET 9 Web API (Dapper, no EF) + Angular 20 (PrimeNG 20, standalone). Git: `main` is stable, day-to-day work goes on `develop`.

## Layout

| Path | Purpose |
|------|---------|
| `database\*.sql` | Schema source of truth (database `CMS` on `.\SQLEXPRESS`) |
| `spec\{sub-system}\{Table}.md` | Per-feature specs written by `/crud` (`spec\*.spec.md` are samples, `spec\ui-sample-*.png` style references) |
| `src\CMS.API\`, `src\CMS.API.Tests\` | Backend + xUnit tests (solution `src\CMS.slnx`) |
| `src\CMS.NG\` | Frontend |

## Read when relevant

- `spec\code-gen.convention.md` — scaffolding rules: naming, backend/frontend file layout, endpoints, list/form page rules. **Read before adding or changing a feature.**
- `docs\patterns.md` — recipes: FK deletes/cascades, non-identity keys, server-controlled columns, `SysConfig`, n-n vs child tables, lookups, sticky form toolbar, dates, test mocking.
- `docs\features.md` — one entry per shipped feature. Read before touching a feature or linking to one; append an entry when a feature ships.
- `docs\gotchas.md` — tooling pitfalls: smoke-testing SQL beside the dev server, curl encoding, bundle budget, `/crud` spec re-use.

## Commands

```powershell
# Backend (http://localhost:5000, Swagger at /swagger) — set ASPNETCORE_ENVIRONMENT=Development first (--no-launch-profile skips it)
cd src; dotnet run --project CMS.API --no-launch-profile --urls http://localhost:5000
cd src; dotnet test CMS.slnx

# Frontend (http://localhost:4200)
cd src\CMS.NG; npx ng serve
cd src\CMS.NG; npx ng test --watch=false --browsers=ChromeHeadless
cd src\CMS.NG; npx ng build
```

## Always-on rules

- Backend tests use in-memory fake repositories and never hit SQL — verify new SQL manually against the real DB.
- Source files contain Chinese UI text and must stay UTF-8: use the Edit/Write tools, never PowerShell 5.1 `Get-Content`/`Set-Content` without `-Encoding utf8`.
- A running `dotnet run` locks `bin\Debug`, so `dotnet test` fails with a file-lock error: stop the server or use `-c Release`.
- Files use LF; Git's CRLF warnings on Windows are harmless.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`netprof/cms-1019`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, plus `spec` on every issue `/to-spec` publishes. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/` (created lazily). See `docs/agents/domain.md`.
