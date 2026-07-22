# Capsomnia for Windows — uninstaller.
# Restores the lid-close action, removes the helper tasks, autostart entry,
# installed files, and state. Run from an elevated PowerShell.

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (administrator)."
}

$installDir = Join-Path $env:ProgramFiles "Capsomnia"
$helperExe = Join-Path $installDir "capsomnia-power-helper.exe"
$stateDir = Join-Path $env:ProgramData "Capsomnia"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Write-Host "Stopping Capsomnia..."
Get-Process -Name "Capsomnia" -ErrorAction SilentlyContinue | Stop-Process -Force

if (Test-Path $helperExe) {
    Write-Host "Restoring normal lid-close behavior..."
    & $helperExe off | Out-Null
}

Write-Host "Removing helper tasks..."
foreach ($name in @("Capsomnia Lid On", "Capsomnia Lid Off")) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
}

Write-Host "Removing autostart entry..."
Remove-ItemProperty -Path $runKey -Name "Capsomnia" -ErrorAction SilentlyContinue

Write-Host "Removing files..."
Remove-Item -Recurse -Force $installDir -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $stateDir -ErrorAction SilentlyContinue

Write-Host "Done. Per-user settings remain in %APPDATA%\Capsomnia; delete that folder to remove them too."
