# Pester 3.4 tests (the version bundled with Windows PowerShell 5.1).
# Run: Invoke-Pester -Script tools\token-usage
. "$PSScriptRoot\TokenUsageHook.ps1"

$script:utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function New-AssistantLine {
    param(
        [string]$Id, [string]$Model = 'claude-opus-5-5', [string]$Timestamp = '2026-10-20T03:00:00.000Z',
        [long]$In = 0, [long]$Cw5m = 0, [long]$Cw1h = 0, [long]$Read = 0, [long]$Out = 0
    )
    @{
        type      = 'assistant'
        timestamp = $Timestamp
        message   = @{
            id    = $Id
            model = $Model
            role  = 'assistant'
            usage = @{
                input_tokens                = $In
                cache_creation_input_tokens = $Cw5m + $Cw1h
                cache_read_input_tokens     = $Read
                output_tokens               = $Out
                cache_creation              = @{ ephemeral_5m_input_tokens = $Cw5m; ephemeral_1h_input_tokens = $Cw1h }
            }
        }
    } | ConvertTo-Json -Depth 10 -Compress
}

function New-Transcript {
    param([string]$Path, [string[]]$Lines)
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllLines($Path, $Lines, $script:utf8NoBom)
    $Path
}

function New-PlainFolder {
    param([string]$Name)
    $path = Join-Path $TestDrive $Name
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    $path
}

Describe 'ConvertTo-TokenUsageReport' {
    $cwd = New-PlainFolder 'plain-project'

    It 'sums the five token kinds of one assistant message into one row' {
        $t = New-Transcript "$TestDrive\one.jsonl" @(
            '{"type":"user","timestamp":"2026-10-20T02:59:00.000Z","message":{"role":"user","content":"hi"}}',
            (New-AssistantLine -Id 'msg_1' -In 3 -Cw5m 10 -Cw1h 20 -Read 40 -Out 7)
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's-1' -UserId 'alice'

        $report.sessionId | Should Be 's-1'
        $report.userId | Should Be 'alice'
        @($report.rows).Count | Should Be 1
        $row = $report.rows[0]
        $row.date | Should Be '2026-10-20'
        $row.model | Should Be 'claude-opus-5-5'
        $row.inputTokens | Should Be 3
        $row.cacheWrite5mTokens | Should Be 10
        $row.cacheWrite1hTokens | Should Be 20
        $row.cacheReadTokens | Should Be 40
        $row.outputTokens | Should Be 7
    }

    It 'counts a message once when its content blocks repeat the same message.id' {
        $t = New-Transcript "$TestDrive\dup.jsonl" @(
            (New-AssistantLine -Id 'msg_a' -In 2 -Read 100 -Out 5),
            (New-AssistantLine -Id 'msg_a' -In 2 -Read 100 -Out 5),
            (New-AssistantLine -Id 'msg_a' -In 2 -Read 100 -Out 5),
            (New-AssistantLine -Id 'msg_b' -In 1 -Read 50 -Out 3)
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

        @($report.rows).Count | Should Be 1
        $report.rows[0].inputTokens | Should Be 3
        $report.rows[0].cacheReadTokens | Should Be 150
        $report.rows[0].outputTokens | Should Be 8
    }

    It 'takes the largest usage of each field when a streamed reply''s lines report partial usage' {
        # Real transcripts: earlier content-block lines of one reply carry a partial output_tokens.
        $t = New-Transcript "$TestDrive\partial.jsonl" @(
            (New-AssistantLine -Id 'msg_s' -In 2 -Cw5m 1775 -Read 53099 -Out 8),
            (New-AssistantLine -Id 'msg_s' -In 2 -Cw5m 1775 -Read 53099 -Out 8),
            (New-AssistantLine -Id 'msg_s' -In 2 -Cw5m 1775 -Read 53099 -Out 4538),
            (New-AssistantLine -Id 'msg_t' -In 1 -Read 10 -Out 142),
            (New-AssistantLine -Id 'msg_t' -In 1 -Read 10 -Out 37)
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

        @($report.rows).Count | Should Be 1
        $report.rows[0].inputTokens | Should Be 3
        $report.rows[0].cacheWrite5mTokens | Should Be 1775
        $report.rows[0].cacheReadTokens | Should Be 53109
        $report.rows[0].outputTokens | Should Be 4680
    }

    It 'skips entries whose model is <synthetic>' {
        $t = New-Transcript "$TestDrive\synthetic.jsonl" @(
            (New-AssistantLine -Id 'msg_real' -In 4 -Out 6),
            (New-AssistantLine -Id 'c0ffee00-synthetic' -Model '<synthetic>' -In 0 -Out 0)
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

        @($report.rows).Count | Should Be 1
        $report.rows[0].model | Should Be 'claude-opus-5-5'
    }

    It 'dates each message in Taipei time (UTC+8), splitting at Taipei midnight' {
        $t = New-Transcript "$TestDrive\midnight.jsonl" @(
            (New-AssistantLine -Id 'msg_before' -Timestamp '2026-10-19T15:59:59.999Z' -Out 1),
            (New-AssistantLine -Id 'msg_after' -Timestamp '2026-10-19T16:00:00.000Z' -Out 10),
            (New-AssistantLine -Id 'msg_later' -Timestamp '2026-10-20T02:00:00.000Z' -Out 100)
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

        $byDate = @{}
        foreach ($row in $report.rows) { $byDate[$row.date] = $row.outputTokens }
        $byDate.Count | Should Be 2
        $byDate['2026-10-19'] | Should Be 1
        $byDate['2026-10-20'] | Should Be 110
    }

    It 'keeps one row per model on the same date' {
        $t = New-Transcript "$TestDrive\models.jsonl" @(
            (New-AssistantLine -Id 'msg_o1' -Model 'claude-opus-5-5' -Out 1),
            (New-AssistantLine -Id 'msg_s1' -Model 'claude-sonnet-5-5' -Out 20),
            (New-AssistantLine -Id 'msg_o2' -Model 'claude-opus-5-5' -Out 2)
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

        $byModel = @{}
        foreach ($row in $report.rows) { $byModel[$row.model] = $row.outputTokens }
        $byModel.Count | Should Be 2
        $byModel['claude-opus-5-5'] | Should Be 3
        $byModel['claude-sonnet-5-5'] | Should Be 20
    }

    It 'includes the session''s subagent transcripts' {
        $main = New-Transcript "$TestDrive\proj\sess-1.jsonl" @(
            (New-AssistantLine -Id 'msg_main' -Model 'claude-opus-5-5' -Out 5)
        )
        New-Transcript "$TestDrive\proj\sess-1\subagents\agent-abc.jsonl" @(
            (New-AssistantLine -Id 'msg_sub' -Model 'claude-haiku-5-5' -Out 70)
        ) | Out-Null
        New-Item -ItemType File "$TestDrive\proj\sess-1\subagents\agent-abc.meta.json" -Value '{}' | Out-Null
        New-Transcript "$TestDrive\proj\sess-2\subagents\agent-other.jsonl" @(
            (New-AssistantLine -Id 'msg_other_session' -Model 'claude-haiku-5-5' -Out 9000)
        ) | Out-Null

        $paths = Get-SessionTranscriptPaths -TranscriptPath $main
        $report = ConvertTo-TokenUsageReport -TranscriptPaths $paths -Cwd $cwd -SessionId 'sess-1' -UserId 'u'

        $byModel = @{}
        foreach ($row in $report.rows) { $byModel[$row.model] = $row.outputTokens }
        $byModel['claude-opus-5-5'] | Should Be 5
        $byModel['claude-haiku-5-5'] | Should Be 70
    }

    It 'ignores unparsable lines and treats a missing cache_creation breakdown as 5-minute writes' {
        $t = New-Transcript "$TestDrive\robust.jsonl" @(
            '{"type":"assistant","timestamp":"2026-10-20T01:00:00Z","message":{"id":"msg_old","model":"claude-opus-5-5","usage":{"input_tokens":1,"cache_creation_input_tokens":30,"cache_read_input_tokens":2,"output_tokens":3}}}',
            '{"type":"assistant","timestamp":"2026-10-20T01:0',
            ''
        )

        $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

        @($report.rows).Count | Should Be 1
        $report.rows[0].cacheWrite5mTokens | Should Be 30
        $report.rows[0].cacheWrite1hTokens | Should Be 0
    }

    Context 'session name' {
        function New-TitleLine([string]$Type, [string]$Title) {
            $property = if ($Type -eq 'custom-title') { 'customTitle' } else { 'aiTitle' }
            @{ type = $Type; $property = $Title; sessionId = 's' } | ConvertTo-Json -Compress
        }

        It 'is the last /rename title, even when Claude generated one later' {
            # Chinese built from char codes: Windows PowerShell reads this BOM-less file in the ANSI code page.
            $chinese = -join ([char[]](0x4FEE, 0x6B63, 0x767B, 0x5165)) + ' bug'
            $t = New-Transcript "$TestDrive\titles.jsonl" @(
                (New-TitleLine 'ai-title' 'Generated'),
                (New-TitleLine 'custom-title' 'First name'),
                (New-AssistantLine -Id 'msg_1' -Out 1),
                (New-TitleLine 'custom-title' $chinese),
                (New-TitleLine 'ai-title' 'Generated again')
            )

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

            $report.sessionName | Should BeExactly $chinese
        }

        It 'falls back to the last title Claude generated' {
            $t = New-Transcript "$TestDrive\ai-title.jsonl" @(
                (New-TitleLine 'ai-title' 'Old'),
                (New-TitleLine 'ai-title' 'CMS scaffold'),
                (New-AssistantLine -Id 'msg_1' -Out 1)
            )

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

            $report.sessionName | Should Be 'CMS scaffold'
        }

        It 'is null without a title, and posts as JSON null' {
            $t = New-Transcript "$TestDrive\untitled.jsonl" @((New-AssistantLine -Id 'msg_1' -Out 1))

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

            $report.sessionName | Should BeNullOrEmpty
            ($report | ConvertTo-Json -Compress) | Should Match '"sessionName":null'
        }

        It 'ignores titles in subagent transcripts' {
            $main = New-Transcript "$TestDrive\titled\sess-t.jsonl" @((New-AssistantLine -Id 'msg_main' -Out 1))
            New-Transcript "$TestDrive\titled\sess-t\subagents\agent-x.jsonl" @(
                (New-TitleLine 'custom-title' 'Subagent title'),
                (New-AssistantLine -Id 'msg_sub' -Out 2)
            ) | Out-Null

            $report = ConvertTo-TokenUsageReport -TranscriptPaths (Get-SessionTranscriptPaths $main) -Cwd $cwd -SessionId 's' -UserId 'u'

            $report.sessionName | Should BeNullOrEmpty
        }

        It 'still counts an assistant line that merely quotes a title entry' {
            # A tool call whose input object has its own "type":"custom-title".
            $t = New-Transcript "$TestDrive\quoting.jsonl" @(
                '{"type":"assistant","timestamp":"2026-10-20T03:00:00.000Z","message":{"id":"msg_q","model":"claude-opus-5-5","content":[{"type":"tool_use","input":{"type":"custom-title","customTitle":"not mine"}}],"usage":{"input_tokens":0,"cache_read_input_tokens":0,"output_tokens":9}}}'
            )

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $cwd -SessionId 's' -UserId 'u'

            @($report.rows).Count | Should Be 1
            $report.rows[0].outputTokens | Should Be 9
            $report.sessionName | Should BeNullOrEmpty
        }

        It 'is cut to 200 characters without splitting a surrogate pair' {
            $long = New-Transcript "$TestDrive\long.jsonl" @((New-TitleLine 'custom-title' ('n' * 250)), (New-AssistantLine -Id 'msg_1' -Out 1))
            $emoji = [char]::ConvertFromUtf32(0x1F600)
            $pair = New-Transcript "$TestDrive\pair.jsonl" @((New-TitleLine 'custom-title' (('n' * 199) + $emoji)), (New-AssistantLine -Id 'msg_1' -Out 1))

            (ConvertTo-TokenUsageReport -TranscriptPaths $long -Cwd $cwd -SessionId 's' -UserId 'u').sessionName.Length | Should Be 200
            (ConvertTo-TokenUsageReport -TranscriptPaths $pair -Cwd $cwd -SessionId 's' -UserId 'u').sessionName | Should Be ('n' * 199)
        }
    }

    Context 'project' {
        $t = New-Transcript "$TestDrive\project.jsonl" @((New-AssistantLine -Id 'msg_p' -Out 1))

        It 'is the folder name when the cwd has no git remote' {
            $folder = New-PlainFolder 'no-remote-folder'
            & git -C $folder init -q 2>$null

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $folder -SessionId 's' -UserId 'u'

            $report.project | Should Be 'no-remote-folder'
        }

        It 'is owner/repo of an https origin remote, even from a subfolder' {
            $repo = New-PlainFolder 'https-clone'
            & git -C $repo init -q 2>$null
            & git -C $repo remote add origin 'https://github.com/netprof/cms-1019.git'
            $sub = New-PlainFolder 'https-clone\src\app'

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $sub -SessionId 's' -UserId 'u'

            $report.project | Should Be 'netprof/cms-1019'
        }

        It 'is owner/repo of an ssh origin remote' {
            $repo = New-PlainFolder 'ssh-clone'
            & git -C $repo init -q 2>$null
            & git -C $repo remote add origin 'git@github.com:acme/widgets.git'

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd $repo -SessionId 's' -UserId 'u'

            $report.project | Should Be 'acme/widgets'
        }

        It 'asks git from the nearest existing folder when the cwd is gone (a removed worktree)' {
            $repo = New-PlainFolder 'gone-clone'
            & git -C $repo init -q 2>$null
            & git -C $repo remote add origin 'https://github.com/netprof/cms-1019.git'

            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd "$repo\.claude\worktrees\deleted" -SessionId 's' -UserId 'u'

            $report.project | Should Be 'netprof/cms-1019'
        }

        It 'is the folder name of a gone cwd outside any repository' {
            $report = ConvertTo-TokenUsageReport -TranscriptPaths $t -Cwd "$TestDrive\never-existed\some-app" -SessionId 's' -UserId 'u'

            $report.project | Should Be 'some-app'
        }
    }
}

Describe 'Invoke-TokenUsageHook' {
    $cwd = New-PlainFolder 'hook-project'
    $transcript = New-Transcript "$TestDrive\hookproj\sess-h.jsonl" @(
        (New-AssistantLine -Id 'msg_h' -In 1 -Out 2)
    )
    $hookInput = @{
        session_id = 'sess-h'; transcript_path = $transcript; cwd = $cwd
        hook_event_name = 'SessionEnd'; reason = 'exit'
    } | ConvertTo-Json -Compress

    function New-Config([hashtable]$Values) {
        $path = Join-Path $TestDrive ("config-{0}.json" -f [guid]::NewGuid())
        [System.IO.File]::WriteAllText($path, ($Values | ConvertTo-Json), $script:utf8NoBom)
        $path
    }

    function New-RecordingSender([bool]$Ok, [bool]$Reachable = $true, $Status = $null) {
        $calls = New-Object System.Collections.ArrayList
        $sender = { param($Url, $ApiKey, $Body)
            [void]$calls.Add([pscustomobject]@{ Url = $Url; ApiKey = $ApiKey; Body = $Body })
            [pscustomobject]@{ Ok = $Ok; Reachable = $Reachable; Status = $Status; Message = 'fake' }
        }.GetNewClosure()
        [pscustomobject]@{ Calls = $calls; Sender = $sender }
    }

    $goodConfig = @{ apiUrl = 'http://cms.test/api/tokenusages'; apiKey = 'k-123'; userId = 'alice' }

    It 'logs one line and sends nothing when the config lacks a value' {
        $config = New-Config @{ apiUrl = 'http://cms.test/api/tokenusages'; apiKey = 'k-123' }
        $log = Join-Path $TestDrive 'missing.log'
        $rec = New-RecordingSender $true

        Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir "$TestDrive\spool-missing" -LogPath $log -Sender $rec.Sender

        $rec.Calls.Count | Should Be 0
        @(Get-Content $log).Count | Should Be 1
        (Get-Content $log) | Should Match 'userId'
    }

    It 'logs one line and sends nothing when the config file does not exist' {
        $log = Join-Path $TestDrive 'noconfig.log'
        $rec = New-RecordingSender $true

        Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath "$TestDrive\nope.json" -SpoolDir "$TestDrive\spool-nc" -LogPath $log -Sender $rec.Sender

        $rec.Calls.Count | Should Be 0
        @(Get-Content $log).Count | Should Be 1
    }

    It 'posts the session report with the configured url, key and user' {
        $rec = New-RecordingSender $true

        Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath (New-Config $goodConfig) -SpoolDir "$TestDrive\spool-ok" -LogPath "$TestDrive\ok.log" -Sender $rec.Sender

        $rec.Calls.Count | Should Be 1
        $rec.Calls[0].Url | Should Be 'http://cms.test/api/tokenusages'
        $rec.Calls[0].ApiKey | Should Be 'k-123'
        $body = $rec.Calls[0].Body | ConvertFrom-Json
        $body.sessionId | Should Be 'sess-h'
        $body.userId | Should Be 'alice'
        $body.project | Should Be 'hook-project'
        @($body.rows).Count | Should Be 1
        $body.rows[0].outputTokens | Should Be 2
        @(Get-ChildItem "$TestDrive\spool-ok" -ErrorAction SilentlyContinue).Count | Should Be 0
    }

    Context 'spool' {
        $config = New-Config $goodConfig
        $spool = Join-Path $TestDrive 'spool'
        $log = Join-Path $TestDrive 'spool.log'

        It 'spools the payload when the send fails, without throwing' {
            $down = New-RecordingSender $false $false

            { Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $spool -LogPath $log -Sender $down.Sender } | Should Not Throw

            $files = @(Get-ChildItem $spool -Filter '*.json')
            $files.Count | Should Be 1
            ([IO.File]::ReadAllText($files[0].FullName) | ConvertFrom-Json).sessionId | Should Be 'sess-h'
        }

        It 'spools the payload when the sender throws' {
            $otherSpool = Join-Path $TestDrive 'spool-throw'
            $throwing = { param($Url, $ApiKey, $Body) throw 'boom' }

            { Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $otherSpool -LogPath $log -Sender $throwing } | Should Not Throw

            @(Get-ChildItem $otherSpool -Filter '*.json').Count | Should Be 1
        }

        It 're-sends spooled payloads first on the next run and deletes them once sent' {
            $earlier = @{ session_id = 'sess-earlier'; transcript_path = $transcript; cwd = $cwd } | ConvertTo-Json -Compress
            Invoke-TokenUsageHook -HookInput $earlier -ConfigPath $config -SpoolDir $spool -LogPath $log -Sender (New-RecordingSender $false $false).Sender
            @(Get-ChildItem $spool -Filter '*.json').Count | Should Be 2

            $up = New-RecordingSender $true
            $next = @{ session_id = 'sess-next'; transcript_path = $transcript; cwd = $cwd } | ConvertTo-Json -Compress
            Invoke-TokenUsageHook -HookInput $next -ConfigPath $config -SpoolDir $spool -LogPath $log -Sender $up.Sender

            $sent = @($up.Calls | ForEach-Object { ($_.Body | ConvertFrom-Json).sessionId })
            $sent.Count | Should Be 3
            $sent[2] | Should Be 'sess-next'
            ($sent[0..1] | Sort-Object) -join ',' | Should Be 'sess-earlier,sess-h'
            @(Get-ChildItem $spool -Filter '*.json').Count | Should Be 0
        }

        It 'stops re-sending once the API is unreachable, keeping the remaining spool' {
            $s = Join-Path $TestDrive 'spool-unreachable'
            foreach ($id in 'a', 'b', 'c') {
                $in = @{ session_id = "sess-$id"; transcript_path = $transcript; cwd = $cwd } | ConvertTo-Json -Compress
                Invoke-TokenUsageHook -HookInput $in -ConfigPath $config -SpoolDir $s -LogPath $log -Sender (New-RecordingSender $false $false).Sender
            }
            $down = New-RecordingSender $false $false

            Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $s -LogPath $log -Sender $down.Sender

            $down.Calls.Count | Should Be 1
            @(Get-ChildItem $s -Filter '*.json').Count | Should Be 4
        }

        It 'moves a payload the API rejects with HTTP 400 to rejected\ and logs it' {
            $s = Join-Path $TestDrive 'spool-400'
            $l = Join-Path $TestDrive 'spool-400.log'
            $bad = New-RecordingSender $false $true 400

            Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $s -LogPath $l -Sender $bad.Sender

            @(Get-ChildItem $s -Filter '*.json' -File).Count | Should Be 0
            $rejected = @(Get-ChildItem (Join-Path $s 'rejected') -Filter '*.json' -File)
            $rejected.Count | Should Be 1
            ([IO.File]::ReadAllText($rejected[0].FullName) | ConvertFrom-Json).sessionId | Should Be 'sess-h'
            (Get-Content $l) -join "`n" | Should Match 'rejected'
        }

        It 'moves a spooled payload rejected with HTTP 400 to rejected\ and never re-sends it' {
            $s = Join-Path $TestDrive 'spool-400-resend'
            $earlier = @{ session_id = 'sess-old'; transcript_path = $transcript; cwd = $cwd } | ConvertTo-Json -Compress
            Invoke-TokenUsageHook -HookInput $earlier -ConfigPath $config -SpoolDir $s -LogPath $log -Sender (New-RecordingSender $false $false).Sender

            Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $s -LogPath $log -Sender (New-RecordingSender $false $true 400).Sender
            $up = New-RecordingSender $true
            Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $s -LogPath $log -Sender $up.Sender

            $up.Calls.Count | Should Be 1
            @(Get-ChildItem $s -Filter '*.json' -File).Count | Should Be 0
            @(Get-ChildItem (Join-Path $s 'rejected') -Filter '*.json' -File).Count | Should Be 2
        }

        It 'keeps a payload rejected with HTTP 401 in the spool for retry' {
            $s = Join-Path $TestDrive 'spool-401'
            $unauthorized = New-RecordingSender $false $true 401

            Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $s -LogPath $log -Sender $unauthorized.Sender
            $up = New-RecordingSender $true
            Invoke-TokenUsageHook -HookInput $hookInput -ConfigPath $config -SpoolDir $s -LogPath $log -Sender $up.Sender

            $up.Calls.Count | Should Be 2
            @(Get-ChildItem $s -Filter '*.json' -File).Count | Should Be 0
            Test-Path (Join-Path $s 'rejected') | Should Be $false
        }
    }
}

Describe 'Invoke-TokenUsageBackfill' {
    $config = Join-Path $TestDrive 'backfill-config.json'
    [System.IO.File]::WriteAllText($config,
        (@{ apiUrl = 'http://cms.test/api/tokenusages'; apiKey = 'k'; userId = 'alice' } | ConvertTo-Json), $script:utf8NoBom)
    $cwd = New-PlainFolder 'backfill-app'
    $cwdLine = @{ type = 'user'; cwd = $cwd; message = @{ role = 'user'; content = 'hi' } } | ConvertTo-Json -Compress

    function New-Projects([string]$Name) {
        $projects = Join-Path $TestDrive $Name
        New-Transcript "$projects\C--a\sess-1.jsonl" @($cwdLine,
            '{"type":"ai-title","aiTitle":"First session"}', (New-AssistantLine -Id 'msg_1' -Out 1)) | Out-Null
        New-Transcript "$projects\C--a\sess-1\subagents\agent-x.jsonl" @((New-AssistantLine -Id 'msg_sub' -Out 20)) | Out-Null
        New-Transcript "$projects\C--b\sess-2.jsonl" @($cwdLine, (New-AssistantLine -Id 'msg_2' -Out 300)) | Out-Null
        New-Transcript "$projects\C--b\sess-empty.jsonl" @($cwdLine) | Out-Null
        New-Transcript "$projects\C--b\sess-nocwd.jsonl" @((New-AssistantLine -Id 'msg_3' -Out 4000)) | Out-Null
        $projects
    }

    function New-RecordingSender([bool]$Ok, [bool]$Reachable = $true, $Status = $null) {
        $calls = New-Object System.Collections.ArrayList
        $sender = { param($Url, $ApiKey, $Body)
            [void]$calls.Add(($Body | ConvertFrom-Json))
            [pscustomobject]@{ Ok = $Ok; Reachable = $Reachable; Status = $Status; Message = 'fake' }
        }.GetNewClosure()
        [pscustomobject]@{ Calls = $calls; Sender = $sender }
    }

    It 'posts every main transcript with usage, subagents included, and skips the rest' {
        $up = New-RecordingSender $true

        $counts = Invoke-TokenUsageBackfill -ProjectsDir (New-Projects 'bf-ok') -ConfigPath $config `
            -SpoolDir "$TestDrive\bf-ok-spool" -LogPath "$TestDrive\bf-ok.log" -Sender $up.Sender

        ($up.Calls | ForEach-Object { $_.sessionId } | Sort-Object) -join ',' | Should Be 'sess-1,sess-2'
        $first = $up.Calls | Where-Object { $_.sessionId -eq 'sess-1' }
        $first.sessionName | Should Be 'First session'
        $first.project | Should Be 'backfill-app'
        ($first.rows | Measure-Object outputTokens -Sum).Sum | Should Be 21
        $counts.sent | Should Be 2
        $counts.skipped | Should Be 2
        (Get-Content "$TestDrive\bf-ok.log") -join "`n" | Should Match 'Backfill: 2 sent'
    }

    It 'tries the API once when it is down, spooling the rest without sending' {
        $down = New-RecordingSender $false $false
        $spool = "$TestDrive\bf-down-spool"

        $counts = Invoke-TokenUsageBackfill -ProjectsDir (New-Projects 'bf-down') -ConfigPath $config `
            -SpoolDir $spool -LogPath "$TestDrive\bf-down.log" -Sender $down.Sender

        $down.Calls.Count | Should Be 1
        $counts.spooled | Should Be 2
        @(Get-ChildItem $spool -Filter '*.json' -File).Count | Should Be 2
    }

    It 'moves sessions the API rejects to rejected\' {
        $bad = New-RecordingSender $false $true 400
        $spool = "$TestDrive\bf-400-spool"

        $counts = Invoke-TokenUsageBackfill -ProjectsDir (New-Projects 'bf-400') -ConfigPath $config `
            -SpoolDir $spool -LogPath "$TestDrive\bf-400.log" -Sender $bad.Sender

        $counts.rejected | Should Be 2
        @(Get-ChildItem (Join-Path $spool 'rejected') -Filter '*.json' -File).Count | Should Be 2
    }

    It 'sends nothing and reports a failure when the config is unusable' {
        $up = New-RecordingSender $true

        $counts = Invoke-TokenUsageBackfill -ProjectsDir (New-Projects 'bf-noconfig') -ConfigPath "$TestDrive\nope.json" `
            -SpoolDir "$TestDrive\bf-nc-spool" -LogPath "$TestDrive\bf-nc.log" -Sender $up.Sender

        $up.Calls.Count | Should Be 0
        $counts.failed | Should Be 1
    }
}
