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
#>
param(
    [string]$ConfigPath,
    [string]$SpoolDir,
    [string]$LogPath
)

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
function Get-ProjectName {
    param([Parameter(Mandatory)][string]$Cwd)
    $url = $null
    try {
        $remotes = @(& git -C $Cwd remote 2>$null)
        if ($LASTEXITCODE -eq 0 -and $remotes.Count -gt 0) {
            $remote = if ($remotes -contains 'origin') { 'origin' } else { $remotes[0] }
            $url = (& git -C $Cwd remote get-url $remote 2>$null | Select-Object -First 1)
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

    $groups = [ordered]@{}
    $seenIds = New-Object System.Collections.Generic.HashSet[string]
    foreach ($path in $TranscriptPaths) {
        foreach ($line in [System.IO.File]::ReadLines($path, [Text.Encoding]::UTF8)) {
            # Cheap pre-filter: user/tool-result lines can be large and never carry usage.
            if ($line.IndexOf('"type":"assistant"', [StringComparison]::Ordinal) -lt 0) { continue }
            try { $entry = $line | ConvertFrom-Json } catch { continue }  # e.g. a half-written last line
            if ($entry.type -ne 'assistant') { continue }
            $message = $entry.message
            $usage = $message.usage
            if (-not $usage -or -not $message.id -or -not $entry.timestamp) { continue }
            # Claude Code's own placeholder replies (errors, interrupts) carry no real usage.
            if ($message.model -eq '<synthetic>') { continue }
            # Each content block of one reply is its own line repeating the same usage.
            if (-not $seenIds.Add([string]$message.id)) { continue }
            $date = ConvertTo-TaipeiDate $entry.timestamp
            $key = "$date|$($message.model)"
            if (-not $groups.Contains($key)) {
                $groups[$key] = [ordered]@{
                    date = $date; model = [string]$message.model
                    inputTokens = [long]0; cacheWrite5mTokens = [long]0; cacheWrite1hTokens = [long]0
                    cacheReadTokens = [long]0; outputTokens = [long]0
                }
            }
            $row = $groups[$key]
            $row.inputTokens += [long]$usage.input_tokens
            if ($usage.cache_creation) {
                $row.cacheWrite5mTokens += [long]$usage.cache_creation.ephemeral_5m_input_tokens
                $row.cacheWrite1hTokens += [long]$usage.cache_creation.ephemeral_1h_input_tokens
            } else {
                # Older transcripts only have the total, which was always the 5-minute TTL.
                $row.cacheWrite5mTokens += [long]$usage.cache_creation_input_tokens
            }
            $row.cacheReadTokens += [long]$usage.cache_read_input_tokens
            $row.outputTokens += [long]$usage.output_tokens
        }
    }

    [pscustomobject]@{
        sessionId = $SessionId
        userId    = $UserId
        project   = Get-ProjectName $Cwd
        rows      = @($groups.Values | ForEach-Object { [pscustomobject]$_ })
    }
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
        $body = $report | ConvertTo-Json -Depth 5 -Compress

        $result = if ($reachable) { Invoke-Sender $Sender $config $body } else {
            [pscustomobject]@{ Ok = $false; Reachable = $false; Message = 'API unreachable while re-sending the spool' }
        }
        if (-not $result.Ok) {
            Save-SpooledPayload -SpoolDir $SpoolDir -SessionId $report.sessionId -Body $body
            Write-HookLog $LogPath "Session $($report.sessionId) spooled: $($result.Message)"
        }
    } catch {
        Write-HookLog $LogPath "Token usage hook failed: $($_.Exception.Message)"
    }
}

# The real sender: POST with X-Api-Key and a 5-second timeout.
# Reachable is $false when no HTTP response came back (API down, timeout, DNS).
function Send-TokenUsagePayload {
    param([string]$Url, [string]$ApiKey, [string]$Body)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
        $response = Invoke-WebRequest -Uri $Url -Method Post -UseBasicParsing -TimeoutSec 5 `
            -Headers @{ 'X-Api-Key' = $ApiKey } -ContentType 'application/json; charset=utf-8' -Body $bytes
        [pscustomobject]@{ Ok = $true; Reachable = $true; Message = "HTTP $([int]$response.StatusCode)" }
    } catch [System.Net.WebException] {
        $httpResponse = $_.Exception.Response
        if ($httpResponse) {
            $detail = ''
            try {
                $reader = New-Object IO.StreamReader($httpResponse.GetResponseStream(), [Text.Encoding]::UTF8)
                $detail = $reader.ReadToEnd()
                if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
            } catch { }
            [pscustomobject]@{ Ok = $false; Reachable = $true; Message = "HTTP $([int]$httpResponse.StatusCode) $detail" }
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

        # Claude Code writes UTF-8; the console's default code page would garble non-ASCII paths.
        $reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), (New-Object Text.UTF8Encoding($false)))
        $hookInput = $reader.ReadToEnd()

        Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $ConfigPath -SpoolDir $SpoolDir -LogPath $LogPath
    } catch { }
    exit 0
}
