# Tooling gotchas

Pitfalls that only matter in specific situations. The ones that matter every session stay in `CLAUDE.md`.

## Smoke-testing new SQL without stopping the dev server on 5000

Backend tests never touch SQL, so new queries need a manual run. After `dotnet test CMS.slnx -c Release`:

```powershell
cd src\CMS.API\bin\Release\net9.0
dotnet CMS.API.dll --urls http://localhost:5001
```

It must be run from that folder or `appsettings.json` is not found. The server on 5000 keeps running the old build until restarted.

## The CMS database is at compatibility level 100

The server is SQL Server 2025, but the `CMS` database runs at compatibility level 100 (SQL Server 2008), and newer syntax depends on that level, not the server version. Plain `STRING_AGG(x, ', ')` happens to work, but `STRING_AGG … WITHIN GROUP (ORDER BY …)` is `Incorrect syntax near '('`. The in-memory tests cannot catch this, so smoke-test every new query on port 5001 (above). Do not raise the level just for one query; fold rows in C# instead (precedent: `TokenUsageRepository.GetSessionReportRowsAsync`).

## A fresh worktree has no node_modules

`ng test` / `ng build` in a new git worktree fail with `Could not find the '@angular/build:karma' builder's node package`. Run `npm ci` in `src\CMS.NG` first.

## curl and Chinese characters

Git Bash `curl` corrupts Chinese characters in JSON bodies; the API answers 400 "JSON value could not be converted". Use ASCII values for smoke tests, or call the API from PowerShell (`Invoke-RestMethod`).

## Angular bundle budget

`ng build` warns that the initial bundle exceeds the 500 kB `maximumWarning` in `angular.json` (about 583 kB after the server-error toast put `ToastModule` in the app shell; `maximumError` is 1 MB). Warning only. Raise `maximumWarning` when it becomes noise.

## `/crud` re-uses an existing spec

The `/crud` skill writes the spec to `spec/{sub-system}/{Table}.md` first. If that file already exists it skips spec generation and builds from it, so to change a design decision edit the spec and re-run `/crud`. It should not rebuild a feature that is already committed — check the branch first.

## Encoding and line endings

Source files carry Chinese UI text and must stay UTF-8: use the Edit/Write tools, not PowerShell `Get-Content`/`Set-Content` (which default to the ANSI code page in Windows PowerShell 5.1). Files use LF; Git's CRLF conversion warnings on Windows are harmless.
