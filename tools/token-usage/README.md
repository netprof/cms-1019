# Token usage SessionEnd hook

`TokenUsageHook.ps1` is a Claude Code `SessionEnd` hook for Windows PowerShell 5.1. When a session ends it reads the session transcript plus its subagent transcripts, totals token usage per Taipei date (fixed UTC+8) and model, and posts one report to the CMS ingest endpoint `POST /api/tokenusages`.

- Assistant entries are de-duplicated by `message.id`: each content block of a reply is its own line repeating the reply's usage, but a streamed reply's earlier lines can carry a partial `output_tokens`, so the hook keeps the largest value of each usage field per `message.id`. `<synthetic>` entries are skipped.
- The project is the git remote's `owner/repo` (origin first), or the folder name when there is no remote. If the cwd no longer exists (an old transcript's removed worktree), git is asked from the nearest folder above it that still exists.
- The session name is the last `/rename` title (`custom-title` entries), else the last title Claude generated (`ai-title`), else none. Subagent transcripts' titles are ignored. It is cut to 200 characters. A report without a name never wipes a name the API already stored for the session.
- If the POST fails, the payload is written to a spool folder. The next session end re-sends spooled payloads first and deletes each one once the API accepts it. When the API cannot be reached, re-sending stops after the first attempt, so a down API costs one 5-second timeout.
- A payload the API rejects with HTTP 400 goes to the spool's `rejected\` subfolder instead and is never re-sent (see below).
- The hook always exits 0 and never blocks the session. Problems go to a log file.

## Install

1. **Find the API key.** It is the `apiKey` property of the `tokenUsageConfig` row in `SysConfig`:

   ```sql
   SELECT configValue FROM SysConfig WHERE configKey = 'tokenUsageConfig'
   ```

   Replace the placeholder `change-me-token-usage-api-key` with a real secret before rolling this out.

2. **Create the config file** `%USERPROFILE%\.claude\token-usage.json` (save as UTF-8). `userId` must be an active `AppUser.UserId`. `apiUrl` is the full endpoint URL.

   ```json
   {
     "apiUrl": "http://localhost:5000/api/tokenusages",
     "apiKey": "<the apiKey from SysConfig>",
     "userId": "you@example.com"
   }
   ```

   If any of the three values is missing, the hook logs one line and exits without sending.

3. **Register the hook** in the user-level `%USERPROFILE%\.claude\settings.json`. Merge this into the existing `hooks` object instead of replacing the file, and adjust the path to where this repo is cloned:

   ```json
   {
     "hooks": {
       "SessionEnd": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\\dev\\cms\\tools\\token-usage\\TokenUsageHook.ps1\""
             }
           ]
         }
       ]
     }
   }
   ```

4. **Check it.** End a Claude Code session (`/exit`), then confirm that rows exist:

   ```sql
   SELECT * FROM TokenUsage WHERE UserId = 'you@example.com' ORDER BY UpdatedTime DESC
   ```

   If nothing shows up, read `%USERPROFILE%\.claude\token-usage.log` and look in `%USERPROFILE%\.claude\token-usage-spool\`.

## Backfill

The hook only reports sessions as they end. To report the sessions that are still in your local transcripts (sessions from before the install, or from before the hook sent session names), run it once by hand with `-Backfill`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\dev\cms\tools\token-usage\TokenUsageHook.ps1 -Backfill
```

- It reads every `<claude dir>\projects\<project>\<session>.jsonl` (plus its subagents) and posts each session, the same way the hook does. It uses the same config, spool and log.
- Running it again is safe: the API replaces each session as a whole.
- Sessions with no usage, or whose transcript records no cwd, are skipped and never sent. Claude Code deletes old transcripts after a while (`cleanupPeriodDays`), so those sessions cannot be backfilled. Rows the API already holds for them stay as they are.
- When the API cannot be reached, it tries once and spools the rest without waiting for more timeouts. The next session end sends the spool.
- It ends with a summary line, for example `Backfill: 120 sent, 0 spooled, 0 rejected, 8 skipped, 0 failed.`, also written to the log. Override the transcripts folder with `-ProjectsDir`.

## Files and overrides

| What | Default | Override (parameter / environment variable) |
|------|---------|---------------------------------------------|
| Config | `<claude dir>\token-usage.json` | `-ConfigPath` / `TOKEN_USAGE_CONFIG` |
| Spool folder | `<claude dir>\token-usage-spool\` | `-SpoolDir` / `TOKEN_USAGE_SPOOL_DIR` |
| Log | `<claude dir>\token-usage.log` | `-LogPath` / `TOKEN_USAGE_LOG` |

`<claude dir>` is `%CLAUDE_CONFIG_DIR%` when set, otherwise `%USERPROFILE%\.claude`.

A payload rejected with HTTP 401 (wrong or missing key) stays in the spool and is retried at every session end, so fixing `apiKey` in the config is enough. A payload rejected with HTTP 400 (for example an inactive or unknown user) is moved to `<spool folder>\rejected\` and logged; it is never retried, because the same payload would fail again. Fix the cause, then move the file back into the spool folder to have it re-sent, or delete it.

To try the hook by hand without ending a session, pipe a hook-style JSON into it:

```powershell
'{"session_id":"<id>","transcript_path":"C:\\Users\\<you>\\.claude\\projects\\<project>\\<id>.jsonl","cwd":"C:\\dev\\cms"}' |
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\token-usage\TokenUsageHook.ps1 -ConfigPath $env:TEMP\token-usage.json
```

## Tests

Pester 3.4 tests (the version bundled with Windows PowerShell 5.1) cover the parser, the session name, the spool behaviour and the backfill, using small synthetic transcripts:

```powershell
Invoke-Pester -Script tools\token-usage
```
