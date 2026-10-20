# Token usage SessionEnd hook

`TokenUsageHook.ps1` is a Claude Code `SessionEnd` hook for Windows PowerShell 5.1. When a session ends it reads the session transcript plus its subagent transcripts, totals token usage per Taipei date (fixed UTC+8) and model, and posts one report to the CMS ingest endpoint `POST /api/tokenusages`.

- Assistant entries are de-duplicated by `message.id` (each content block repeats the same usage), and `<synthetic>` entries are skipped.
- The project is the git remote's `owner/repo` (origin first), or the folder name when there is no remote.
- If the POST fails, the payload is written to a spool folder. The next session end re-sends spooled payloads first and deletes each one once the API accepts it. When the API cannot be reached, re-sending stops after the first attempt, so a down API costs one 5-second timeout.
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

## Files and overrides

| What | Default | Override (parameter / environment variable) |
|------|---------|---------------------------------------------|
| Config | `<claude dir>\token-usage.json` | `-ConfigPath` / `TOKEN_USAGE_CONFIG` |
| Spool folder | `<claude dir>\token-usage-spool\` | `-SpoolDir` / `TOKEN_USAGE_SPOOL_DIR` |
| Log | `<claude dir>\token-usage.log` | `-LogPath` / `TOKEN_USAGE_LOG` |

`<claude dir>` is `%CLAUDE_CONFIG_DIR%` when set, otherwise `%USERPROFILE%\.claude`.

A payload the API rejects (for example HTTP 400 for an inactive user, or 401 for a wrong key) stays in the spool and is retried at every session end. Fix the cause, or delete the file from the spool folder.

To try the hook by hand without ending a session, pipe a hook-style JSON into it:

```powershell
'{"session_id":"<id>","transcript_path":"C:\\Users\\<you>\\.claude\\projects\\<project>\\<id>.jsonl","cwd":"C:\\dev\\cms"}' |
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\token-usage\TokenUsageHook.ps1 -ConfigPath $env:TEMP\token-usage.json
```

## Tests

Pester 3.4 tests (the version bundled with Windows PowerShell 5.1) cover the parser and the spool behaviour, using small synthetic transcripts:

```powershell
Invoke-Pester -Script tools\token-usage
```
