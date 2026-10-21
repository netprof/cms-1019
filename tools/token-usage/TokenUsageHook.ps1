<#
.SYNOPSIS
    Claude Code SessionEnd hook: reports the session's token usage to the CMS.
.DESCRIPTION
    Reads the hook JSON from stdin, totals the session's (and its subagents') token usage per
    Taipei date and model, and POSTs it to the CMS ingest endpoint. Payloads that cannot be sent
    are spooled and re-sent on the next run. Always exits 0. Targets Windows PowerShell 5.1.
    See README.md beside this file for installation.
    Paths default to the Claude config dir (%CLAUDE_CONFIG_DIR% or %USERPROFILE%\.claude) and can be
    overridden by these parameters or the TOKEN_USAGE_CONFIG / TOKEN_USAGE_SPOOL_DIR / TOKEN_USAGE_LOG
    environment variables.
.PARAMETER Backfill
    Run by hand instead of as a hook: re-sends every session transcript under <Claude config dir>\projects
    (or -ProjectsDir), then prints a summary. Safe to repeat, since the API replaces each session.
#>
param(
    [string]$ConfigPath,
    [string]$SpoolDir,
    [string]$LogPath,
    [switch]$Backfill,
    [string]$ProjectsDir
)

# Matches the API's TokenUsage.SessionName column (nvarchar(200)).
$script:SessionNameMaxLength = 200

# Taipei is a fixed UTC+8 with no DST, so the machine's own time zone is irrelevant.
function ConvertTo-TaipeiDate {
    param([Parameter(Mandatory)][string]$UtcTimestamp)
    $instant = [DateTimeOffset]::Parse($UtcTimestamp, [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal)
    $instant.ToOffset([TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
}

# The main transcript plus <session>\subagents\*.jsonl beside it.
function Get-SessionTranscriptPaths {
    param([Parameter(Mandatory)][string]$TranscriptPath)
    $paths = @()
    if (Test-Path -LiteralPath $TranscriptPath -PathType Leaf) { $paths += $TranscriptPath }
    $sessionDir = Join-Path (Split-Path $TranscriptPath -Parent) ([IO.Path]::GetFileNameWithoutExtension($TranscriptPath))
    $subagentDir = Join-Path $sessionDir 'subagents'
    if (Test-Path -LiteralPath $subagentDir -PathType Container) {
        $paths += @(Get-ChildItem -LiteralPath $subagentDir -Filter '*.jsonl' -File | Sort-Object Name | ForEach-Object { $_.FullName })
    }
    $paths
}

# owner/repo of the git remote (origin first), falling back to the cwd's folder name.
# A cwd that no longer exists (an old transcript's removed worktree) asks git from its nearest existing folder.
function Get-ProjectName {
    param([Parameter(Mandatory)][string]$Cwd)
    $gitCwd = $Cwd
    while ($gitCwd -and -not (Test-Path -LiteralPath $gitCwd -PathType Container)) { $gitCwd = Split-Path $gitCwd -Parent }
    $url = $null
    try {
        if ($gitCwd) { $remotes = @(& git -C $gitCwd remote 2>$null) } else { $remotes = @() }
        if ($LASTEXITCODE -eq 0 -and $remotes.Count -gt 0) {
            $remote = if ($remotes -contains 'origin') { 'origin' } else { $remotes[0] }
            $url = (& git -C $gitCwd remote get-url $remote 2>$null | Select-Object -First 1)
        }
    } catch { $url = $null }

    # https://host/owner/repo(.git), ssh://git@host/owner/repo, git@host:owner/repo.git
    if ($url -and ([string]$url).Trim() -match '[/:]([^/:]+)/([^/:]+?)(?:\.git)?/?$') {
        return "$($Matches[1])/$($Matches[2])"
    }
    Split-Path $Cwd -Leaf
}

function ConvertTo-TokenUsageReport {
    param(
        [Parameter(Mandatory)][string[]]$TranscriptPaths,
        [Parameter(Mandatory)][string]$Cwd,
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$UserId
    )

    # Each content block of one reply is its own line repeating the reply's usage, but a streamed
    # reply's earlier lines can carry a partial output_tokens. Keep, per message.id, the largest
    # value of each field (in real transcripts that is the reply's last line).
    $messages = [ordered]@{}
    # The session's title: the last /rename, else the last title Claude generated. Subagents have none.
    $customTitle = $null
    $aiTitle = $null
    foreach ($path in $TranscriptPaths) {
        $isSubagent = (Split-Path (Split-Path $path -Parent) -Leaf) -eq 'subagents'
        foreach ($line in [System.IO.File]::ReadLines($path, [Text.Encoding]::UTF8)) {
            # Cheap pre-filter: user/tool-result lines can be large and never carry usage or a title.
            # (A match can still be text quoted inside another entry, so the parsed type decides.)
            $maybeTitle = -not $isSubagent -and ($line.IndexOf('"type":"custom-title"', [StringComparison]::Ordinal) -ge 0 -or
                $line.IndexOf('"type":"ai-title"', [StringComparison]::Ordinal) -ge 0)
            if (-not $maybeTitle -and $line.IndexOf('"type":"assistant"', [StringComparison]::Ordinal) -lt 0) { continue }
            try { $entry = $line | ConvertFrom-Json } catch { continue }  # e.g. a half-written last line
            if ($entry.type -eq 'custom-title') {
                if (-not $isSubagent -and ([string]$entry.customTitle).Trim()) { $customTitle = ([string]$entry.customTitle).Trim() }
                continue
            }
            if ($entry.type -eq 'ai-title') {
                if (-not $isSubagent -and ([string]$entry.aiTitle).Trim()) { $aiTitle = ([string]$entry.aiTitle).Trim() }
                continue
            }
            if ($entry.type -ne 'assistant') { continue }
            $message = $entry.message
            $usage = $message.usage
            if (-not $usage -or -not $message.id -or -not $entry.timestamp) { continue }
            # Claude Code's own placeholder replies (errors, interrupts) carry no real usage.
            if ($message.model -eq '<synthetic>') { continue }
            if ($usage.cache_creation) {
                $cw5m = [long]$usage.cache_creation.ephemeral_5m_input_tokens
                $cw1h = [long]$usage.cache_creation.ephemeral_1h_input_tokens
            } else {
                # Older transcripts only have the total, which was always the 5-minute TTL.
                $cw5m = [long]$usage.cache_creation_input_tokens
                $cw1h = [long]0
            }
            $id = [string]$message.id
            if (-not $messages.Contains($id)) {
                # The first line's timestamp dates the reply.
                $messages[$id] = [ordered]@{
                    date = ConvertTo-TaipeiDate $entry.timestamp; model = [string]$message.model
                    inputTokens = [long]0; cacheWrite5mTokens = [long]0; cacheWrite1hTokens = [long]0
                    cacheReadTokens = [long]0; outputTokens = [long]0
                }
            }
            $m = $messages[$id]
            $m.inputTokens = [Math]::Max($m.inputTokens, [long]$usage.input_tokens)
            $m.cacheWrite5mTokens = [Math]::Max($m.cacheWrite5mTokens, $cw5m)
            $m.cacheWrite1hTokens = [Math]::Max($m.cacheWrite1hTokens, $cw1h)
            $m.cacheReadTokens = [Math]::Max($m.cacheReadTokens, [long]$usage.cache_read_input_tokens)
            $m.outputTokens = [Math]::Max($m.outputTokens, [long]$usage.output_tokens)
        }
    }

    $fields = 'inputTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens', 'cacheReadTokens', 'outputTokens'
    $groups = [ordered]@{}
    foreach ($m in $messages.Values) {
        $key = "$($m.date)|$($m.model)"
        if (-not $groups.Contains($key)) {
            $groups[$key] = [ordered]@{
                date = $m.date; model = $m.model
                inputTokens = [long]0; cacheWrite5mTokens = [long]0; cacheWrite1hTokens = [long]0
                cacheReadTokens = [long]0; outputTokens = [long]0
            }
        }
        $row = $groups[$key]
        foreach ($f in $fields) { $row[$f] += $m[$f] }
    }

    $sessionName = if ($customTitle) { $customTitle } else { $aiTitle }

    [pscustomobject]@{
        sessionId   = $SessionId
        userId      = $UserId
        project     = Get-ProjectName $Cwd
        sessionName = Limit-SessionName $sessionName
        rows        = @($groups.Values | ForEach-Object { [pscustomobject]$_ })
    }
}

# Cuts a long title to the API's limit rather than have the whole session rejected,
# without splitting a surrogate pair (the limit counts UTF-16 units, as .NET does).
function Limit-SessionName {
    param([string]$Name)
    if (-not $Name) { return $null }
    if ($Name.Length -le $script:SessionNameMaxLength) { return $Name }
    $length = $script:SessionNameMaxLength
    if ([char]::IsHighSurrogate($Name[$length - 1])) { $length-- }
    $Name.Substring(0, $length)
}

# The working directory recorded in a transcript (the first line that has one), or $null.
function Get-TranscriptCwd {
    param([Parameter(Mandatory)][string]$TranscriptPath)
    foreach ($line in [System.IO.File]::ReadLines($TranscriptPath, [Text.Encoding]::UTF8)) {
        if ($line.IndexOf('"cwd":"', [StringComparison]::Ordinal) -lt 0) { continue }
        try { $entry = $line | ConvertFrom-Json } catch { continue }
        if (([string]$entry.cwd).Trim()) { return [string]$entry.cwd }
    }
    $null
}

function Write-HookLog {
    param([string]$LogPath, [string]$Text)
    try {
        $dir = Split-Path $LogPath -Parent
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $line = '{0:yyyy-MM-dd HH:mm:ss} {1}{2}' -f (Get-Date), $Text, [Environment]::NewLine
        [IO.File]::AppendAllText($LogPath, $line, (New-Object Text.UTF8Encoding($false)))
    } catch { }
}

# Returns the config object, or $null after logging one line when it is unusable.
function Read-HookConfig {
    param([string]$ConfigPath, [string]$LogPath)
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        Write-HookLog $LogPath "Config file $ConfigPath not found; token usage not reported."
        return $null
    }
    try {
        $config = [IO.File]::ReadAllText($ConfigPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
    } catch {
        Write-HookLog $LogPath "Config file $ConfigPath is not valid JSON; token usage not reported."
        return $null
    }
    $missing = @('apiUrl', 'apiKey', 'userId' | Where-Object { -not ([string]$config.$_).Trim() })
    if ($missing.Count -gt 0) {
        Write-HookLog $LogPath ("Config file $ConfigPath lacks {0}; token usage not reported." -f ($missing -join ', '))
        return $null
    }
    $config
}

# Entry point. Never throws: a hook failure must not affect the session.
function Invoke-TokenUsageHook {
    param(
        [string]$HookInput,
        [Parameter(Mandatory)][string]$ConfigPath,
        [Parameter(Mandatory)][string]$SpoolDir,
        [Parameter(Mandatory)][string]$LogPath,
        [scriptblock]$Sender = ${function:Send-TokenUsagePayload}
    )
    try {
        $config = Read-HookConfig -ConfigPath $ConfigPath -LogPath $LogPath
        if (-not $config) { return }

        $reachable = Send-SpooledPayloads -Config $config -SpoolDir $SpoolDir -LogPath $LogPath -Sender $Sender

        $hook = $HookInput | ConvertFrom-Json
        $paths = @(Get-SessionTranscriptPaths -TranscriptPath $hook.transcript_path)
        $report = ConvertTo-TokenUsageReport -TranscriptPaths $paths -Cwd $hook.cwd `
            -SessionId $hook.session_id -UserId ([string]$config.userId).Trim()

        Submit-TokenUsageReport -Config $config -Report $report -SpoolDir $SpoolDir -LogPath $LogPath `
            -Sender $Sender -Reachable $reachable | Out-Null
    } catch {
        Write-HookLog $LogPath "Token usage hook failed: $($_.Exception.Message)"
    }
}

# Sends one report, or (when the API is already known to be unreachable) goes straight to the spool.
# A 400 goes to rejected\. Returns Outcome ('sent', 'spooled' or 'rejected') and whether the API answered.
function Submit-TokenUsageReport {
    param($Config, $Report, [string]$SpoolDir, [string]$LogPath, [scriptblock]$Sender, [bool]$Reachable = $true)
    $body = $Report | ConvertTo-Json -Depth 5 -Compress

    $result = if ($Reachable) { Invoke-Sender $Sender $Config $body } else {
        [pscustomobject]@{ Ok = $false; Reachable = $false; Message = 'API unreachable while re-sending the spool' }
    }
    $outcome = 'sent'
    if (Test-Rejected $result) {
        Save-SpooledPayload -SpoolDir (Join-Path $SpoolDir 'rejected') -SessionId $Report.sessionId -Body $body
        Write-HookLog $LogPath "Session $($Report.sessionId) rejected, moved to rejected\ (not retried): $($result.Message)"
        $outcome = 'rejected'
    } elseif (-not $result.Ok) {
        Save-SpooledPayload -SpoolDir $SpoolDir -SessionId $Report.sessionId -Body $body
        Write-HookLog $LogPath "Session $($Report.sessionId) spooled: $($result.Message)"
        $outcome = 'spooled'
    }
    [pscustomobject]@{ Outcome = $outcome; Reachable = [bool]$result.Reachable }
}

# Manual backfill: reports every main transcript (<projects>\<project>\<session>.jsonl) with its subagents.
# Sessions without usage or without a recorded cwd are skipped, so nothing stored is ever cleared.
# Once the API stops answering, the rest go straight to the spool instead of each waiting out the timeout.
# Returns counts per outcome; never throws.
function Invoke-TokenUsageBackfill {
    param(
        [Parameter(Mandatory)][string]$ProjectsDir,
        [Parameter(Mandatory)][string]$ConfigPath,
        [Parameter(Mandatory)][string]$SpoolDir,
        [Parameter(Mandatory)][string]$LogPath,
        [scriptblock]$Sender = ${function:Send-TokenUsagePayload}
    )
    $counts = [ordered]@{ sent = 0; spooled = 0; rejected = 0; skipped = 0; failed = 0 }
    try {
        $config = Read-HookConfig -ConfigPath $ConfigPath -LogPath $LogPath
        if (-not $config) { $counts.failed = 1; return [pscustomobject]$counts }
        if (-not (Test-Path -LiteralPath $ProjectsDir -PathType Container)) { return [pscustomobject]$counts }

        $reachable = Send-SpooledPayloads -Config $config -SpoolDir $SpoolDir -LogPath $LogPath -Sender $Sender
        $transcripts = @(Get-ChildItem -LiteralPath $ProjectsDir -Directory |
            ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter '*.jsonl' -File } | Sort-Object LastWriteTimeUtc)
        foreach ($transcript in $transcripts) {
            try {
                $cwd = Get-TranscriptCwd -TranscriptPath $transcript.FullName
                if (-not $cwd) { $counts.skipped++; continue }
                $paths = @(Get-SessionTranscriptPaths -TranscriptPath $transcript.FullName)
                $report = ConvertTo-TokenUsageReport -TranscriptPaths $paths -Cwd $cwd `
                    -SessionId $transcript.BaseName -UserId ([string]$config.userId).Trim()
                if (@($report.rows).Count -eq 0) { $counts.skipped++; continue }

                $submitted = Submit-TokenUsageReport -Config $config -Report $report -SpoolDir $SpoolDir -LogPath $LogPath `
                    -Sender $Sender -Reachable $reachable
                $counts[$submitted.Outcome]++
                if (-not $submitted.Reachable) { $reachable = $false }
            } catch {
                $counts.failed++
                Write-HookLog $LogPath "Backfill of $($transcript.FullName) failed: $($_.Exception.Message)"
            }
        }
        Write-HookLog $LogPath ("Backfill: {0} sent, {1} spooled, {2} rejected, {3} skipped, {4} failed." -f
            $counts.sent, $counts.spooled, $counts.rejected, $counts.skipped, $counts.failed)
    } catch {
        $counts.failed++
        Write-HookLog $LogPath "Token usage backfill failed: $($_.Exception.Message)"
    }
    [pscustomobject]$counts
}

# HTTP 400 means the payload itself is bad (e.g. inactive user): re-sending it can never succeed.
# 401 (wrong key) and network failures are fixable outside the payload, so those are retried.
function Test-Rejected {
    param($Result)
    -not $Result.Ok -and $Result.Status -eq 400
}

# The real sender: POST with X-Api-Key and a 5-second timeout.
# Reachable is $false when no HTTP response came back (API down, timeout, DNS); Status is the HTTP status or $null.
function Send-TokenUsagePayload {
    param([string]$Url, [string]$ApiKey, [string]$Body)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
        $response = Invoke-WebRequest -Uri $Url -Method Post -UseBasicParsing -TimeoutSec 5 `
            -Headers @{ 'X-Api-Key' = $ApiKey } -ContentType 'application/json; charset=utf-8' -Body $bytes
        [pscustomobject]@{ Ok = $true; Reachable = $true; Status = [int]$response.StatusCode; Message = "HTTP $([int]$response.StatusCode)" }
    } catch [System.Net.WebException] {
        $httpResponse = $_.Exception.Response
        if ($httpResponse) {
            $detail = ''
            try {
                $reader = New-Object IO.StreamReader($httpResponse.GetResponseStream(), [Text.Encoding]::UTF8)
                $detail = $reader.ReadToEnd()
                if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
            } catch { }
            [pscustomobject]@{ Ok = $false; Reachable = $true; Status = [int]$httpResponse.StatusCode; Message = "HTTP $([int]$httpResponse.StatusCode) $detail" }
        } else {
            [pscustomobject]@{ Ok = $false; Reachable = $false; Message = $_.Exception.Message }
        }
    } catch {
        [pscustomobject]@{ Ok = $false; Reachable = $false; Message = $_.Exception.Message }
    }
}

function Invoke-Sender {
    param([scriptblock]$Sender, $Config, [string]$Body)
    try {
        $result = & $Sender ([string]$Config.apiUrl).Trim() ([string]$Config.apiKey).Trim() $Body
        if ($null -eq $result) { throw 'sender returned nothing' }
        $result
    } catch {
        [pscustomobject]@{ Ok = $false; Reachable = $false; Message = $_.Exception.Message }
    }
}

function Save-SpooledPayload {
    param([string]$SpoolDir, [string]$SessionId, [string]$Body)
    if (-not (Test-Path -LiteralPath $SpoolDir)) { New-Item -ItemType Directory -Path $SpoolDir -Force | Out-Null }
    # One file per session: a later report of the same session replaces the earlier one, as the API does.
    $safeName = ($SessionId -replace '[^A-Za-z0-9_.-]', '_') + '.json'
    [IO.File]::WriteAllText((Join-Path $SpoolDir $safeName), $Body, (New-Object Text.UTF8Encoding($false)))
}

# Re-sends spooled payloads oldest first, deleting each once accepted.
# Returns $false (and stops) as soon as the API cannot be reached, so a down API costs one timeout.
function Send-SpooledPayloads {
    param($Config, [string]$SpoolDir, [string]$LogPath, [scriptblock]$Sender)
    if (-not (Test-Path -LiteralPath $SpoolDir -PathType Container)) { return $true }
    foreach ($file in @(Get-ChildItem -LiteralPath $SpoolDir -Filter '*.json' -File | Sort-Object LastWriteTimeUtc)) {
        $body = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
        $result = Invoke-Sender $Sender $Config $body
        if ($result.Ok) {
            Remove-Item -LiteralPath $file.FullName -Force
        } elseif (Test-Rejected $result) {
            $rejectedDir = Join-Path $SpoolDir 'rejected'
            if (-not (Test-Path -LiteralPath $rejectedDir)) { New-Item -ItemType Directory -Path $rejectedDir -Force | Out-Null }
            Move-Item -LiteralPath $file.FullName -Destination (Join-Path $rejectedDir $file.Name) -Force
            Write-HookLog $LogPath "Spooled $($file.Name) rejected, moved to rejected\ (not retried): $($result.Message)"
        } else {
            Write-HookLog $LogPath "Spooled $($file.Name) not re-sent: $($result.Message)"
            if (-not $result.Reachable) { return $false }
        }
    }
    $true
}

function Resolve-HookPath {
    param([string]$Explicit, [string]$EnvValue, [string]$Default)
    if ($Explicit) { return $Explicit }
    if ($EnvValue) { return $EnvValue }
    $Default
}

# Run only when invoked as a script, not when dot-sourced by the tests.
if ($MyInvocation.InvocationName -ne '.') {
    try {
        $claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
        $ConfigPath = Resolve-HookPath $ConfigPath $env:TOKEN_USAGE_CONFIG (Join-Path $claudeDir 'token-usage.json')
        $SpoolDir = Resolve-HookPath $SpoolDir $env:TOKEN_USAGE_SPOOL_DIR (Join-Path $claudeDir 'token-usage-spool')
        $LogPath = Resolve-HookPath $LogPath $env:TOKEN_USAGE_LOG (Join-Path $claudeDir 'token-usage.log')

        if ($Backfill) {
            $ProjectsDir = Resolve-HookPath $ProjectsDir $null (Join-Path $claudeDir 'projects')
            $counts = Invoke-TokenUsageBackfill -ProjectsDir $ProjectsDir -ConfigPath $ConfigPath -SpoolDir $SpoolDir -LogPath $LogPath
            Write-Host ("Backfill: {0} sent, {1} spooled, {2} rejected, {3} skipped, {4} failed. Details: {5}" -f
                $counts.sent, $counts.spooled, $counts.rejected, $counts.skipped, $counts.failed, $LogPath)
            exit 0
        }

        # Claude Code writes UTF-8; the console's default code page would garble non-ASCII paths.
        $reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), (New-Object Text.UTF8Encoding($false)))
        $hookInput = $reader.ReadToEnd()

        Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $ConfigPath -SpoolDir $SpoolDir -LogPath $LogPath
    } catch { }
    exit 0
}
