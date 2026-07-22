# Capsomnia for Windows — source installer.
# Windows counterpart of the original scripts/install.sh: builds the app,
# installs it with the privileged lid-close helper, and enables start-at-login.
#
# Run from an elevated PowerShell (administrator account):
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#
# The two on-demand scheduled tasks registered here play the role of the
# original narrow sudoers rule: they let the (non-elevated) tray app switch the
# power plan's lid-close action through the helper without a UAC prompt per
# Caps Lock toggle.

[CmdletBinding()]
param(
    # Bundle the .NET runtime into the install so no .NET 10 Desktop Runtime is needed.
    [switch]$SelfContained
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (administrator)."
}

$rootDir = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $env:ProgramFiles "Capsomnia"
$appExe = Join-Path $installDir "Capsomnia.exe"
$helperExe = Join-Path $installDir "capsomnia-power-helper.exe"
$taskOn = "Capsomnia Lid On"
$taskOff = "Capsomnia Lid Off"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

$publishArgs = @("-c", "Release", "-r", "win-x64", "-o", $installDir)
if ($SelfContained) {
    $publishArgs += "--self-contained"
} else {
    $publishArgs += "--no-self-contained"
}

Write-Host "Stopping any running Capsomnia..."
Get-Process -Name "Capsomnia" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Publishing Capsomnia to $installDir ..."
dotnet publish (Join-Path $rootDir "src\Capsomnia") @publishArgs
if ($LASTEXITCODE -ne 0) { Write-Error "dotnet publish (app) failed" }
dotnet publish (Join-Path $rootDir "src\CapsomniaPowerHelper") @publishArgs
if ($LASTEXITCODE -ne 0) { Write-Error "dotnet publish (helper) failed" }

Write-Host "Registering elevated helper tasks..."
$taskUser = "$env:USERDOMAIN\$env:USERNAME"
foreach ($entry in @(@{ Name = $taskOn; Arg = "on" }, @{ Name = $taskOff; Arg = "off" })) {
    Unregister-ScheduledTask -TaskName $entry.Name -Confirm:$false -ErrorAction SilentlyContinue
    $action = New-ScheduledTaskAction -Execute $helperExe -Argument $entry.Arg
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -RunLevel Highest -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    Register-ScheduledTask -TaskName $entry.Name -Action $action -Principal $taskPrincipal -Settings $settings | Out-Null
}

Write-Host "Enabling start at login..."
Set-ItemProperty -Path $runKey -Name "Capsomnia" -Value "`"$appExe`""

Write-Host "Starting Capsomnia..."
Start-Process -FilePath $appExe

Write-Host "Done. Turn Caps Lock on to keep this PC awake."
