# Capsomnia for Windows — on-device verification.
# Automates the README's "Verifying on a real Windows machine" checklist.
# Run from an elevated PowerShell (powercfg /requests needs it):
#   powershell -ExecutionPolicy Bypass -File scripts\verify.ps1

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (powercfg /requests requires administrator)."
}

$script:results = @()

function Report([string]$name, [bool]$ok, [string]$detail = "") {
    $script:results += [pscustomobject]@{ Check = $name; Ok = $ok; Detail = $detail }
    $mark = if ($ok) { "[PASS]" } else { "[FAIL]" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host "$mark $name $(if ($detail) { "— $detail" })" -ForegroundColor $color
}

function Get-LidActionIndexes {
    # Same locale-stable parsing as the app: the AC/DC token + 0x hex index.
    $output = powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $ac = $null; $dc = $null
    foreach ($line in $output) {
        if ($line -match "0x(?<hex>[0-9A-Fa-f]{1,8})\b") {
            $value = [Convert]::ToInt32($Matches["hex"], 16)
            if ($null -eq $ac -and $line -match "\bAC\b") { $ac = $value }
            elseif ($null -eq $dc -and $line -match "\bDC\b") { $dc = $value }
        }
    }
    if ($null -eq $ac -or $null -eq $dc) { return $null }
    [pscustomobject]@{ Ac = $ac; Dc = $dc }
}

function Test-CapsomniaSystemRequest {
    # Section headers (DISPLAY:/SYSTEM:/AWAYMODE:...) are fixed identifiers,
    # not localized. Only look for Capsomnia inside the SYSTEM section.
    $inSystem = $false
    foreach ($line in (powercfg /requests)) {
        if ($line -match "^SYSTEM:") { $inSystem = $true; continue }
        if ($line -match "^[A-Z]+:") { $inSystem = $false }
        if ($inSystem -and $line -match "Capsomnia") { return $true }
    }
    return $false
}

function Wait-CapsLock([bool]$desired) {
    $stateName = if ($desired) { "ON" } else { "OFF" }
    while ([Console]::CapsLock -ne $desired) {
        Write-Host "  → Turn Caps Lock $stateName now (waiting)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
    # Give the app time to poll (250 ms), trigger the helper task, and verify.
    Start-Sleep -Seconds 5
}

Write-Host "`n== 1. Installation checks ==" -ForegroundColor Cyan

$installDir = Join-Path $env:ProgramFiles "Capsomnia"
Report "Capsomnia.exe installed" (Test-Path (Join-Path $installDir "Capsomnia.exe")) $installDir
Report "Helper installed" (Test-Path (Join-Path $installDir "capsomnia-power-helper.exe"))

foreach ($name in @("Capsomnia Lid On", "Capsomnia Lid Off")) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Report "Scheduled task '$name'" ($null -ne $task) $(if ($task) { "RunLevel=$($task.Principal.RunLevel)" })
}

$process = Get-Process -Name "Capsomnia" -ErrorAction SilentlyContinue
Report "Capsomnia is running" ($null -ne $process)

$runValue = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue)."Capsomnia"
Report "Start-at-login Run entry" (-not [string]::IsNullOrEmpty($runValue))

$initialLid = Get-LidActionIndexes
if ($null -eq $initialLid) {
    Report "Lid-close power setting present" $false "no lid setting (desktop?) — only idle-sleep prevention applies; steps below will fail"
} else {
    Report "Lid-close power setting present" $true "AC=$($initialLid.Ac) DC=$($initialLid.Dc)"
}

Write-Host "`n== 2. Caps Lock ON ==" -ForegroundColor Cyan
Wait-CapsLock $true

Report "powercfg /requests shows Capsomnia SYSTEM request" (Test-CapsomniaSystemRequest)
$lidOn = Get-LidActionIndexes
Report "Lid action switched to 'Do nothing' (AC=0, DC=0)" ($null -ne $lidOn -and $lidOn.Ac -eq 0 -and $lidOn.Dc -eq 0) `
    $(if ($lidOn) { "AC=$($lidOn.Ac) DC=$($lidOn.Dc)" } else { "unreadable" })

Write-Host "`n== 3. Caps Lock OFF ==" -ForegroundColor Cyan
Wait-CapsLock $false

Report "Capsomnia SYSTEM request released" (-not (Test-CapsomniaSystemRequest))
$lidOff = Get-LidActionIndexes
$restored = $null -ne $lidOff -and -not ($lidOff.Ac -eq 0 -and $lidOff.Dc -eq 0)
Report "Lid action restored (not 'Do nothing')" $restored `
    $(if ($lidOff) { "AC=$($lidOff.Ac) DC=$($lidOff.Dc)" } else { "unreadable" })

Write-Host "`n== 4. Recent log ==" -ForegroundColor Cyan
$logPath = Join-Path $env:LOCALAPPDATA "Capsomnia\Logs\capsomnia.log"
if (Test-Path $logPath) {
    Get-Content $logPath -Tail 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
} else {
    Write-Host "  (no log file at $logPath)" -ForegroundColor DarkGray
}

$failed = @($script:results | Where-Object { -not $_.Ok })
Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "All $($script:results.Count) checks passed." -ForegroundColor Green
    Write-Host @"

Manual step that cannot be scripted:
  1. Turn Caps Lock ON, close the lid, and confirm the machine stays reachable
     (SSH/RDP/ping) — with the display preference on, screens turn off.
  2. Reopen the lid and turn Caps Lock OFF.
"@
    exit 0
} else {
    Write-Host "$($failed.Count) of $($script:results.Count) checks failed." -ForegroundColor Red
    exit 1
}
