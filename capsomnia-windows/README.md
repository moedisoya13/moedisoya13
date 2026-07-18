# Capsomnia for Windows

A Windows port of [Capsomnia](https://github.com/fuji-mak/Capsomnia) — the macOS menu bar app that turns **Caps Lock into a physical keep-awake switch** for closed-lid laptop work.

Turn Caps Lock on when local work should keep running. Turn Caps Lock off when you want normal sleep behavior back. The Caps Lock light physically shows the current state.

It is useful for AI agents, remote access, builds, downloads, and other long-running or unattended work.

Like the original, this port makes no network requests, collects no telemetry, and requires no account.

> 한국어: Caps Lock을 절전 방지 스위치로 쓰는 macOS 앱 Capsomnia의 Windows 포팅입니다. Caps Lock을 켜면 덮개를 닫아도 작업이 계속 실행되고, 끄면 정상 절전으로 돌아갑니다. 설치는 아래 Quick Start를 따르세요 (설치 시 1회 관리자 권한 필요).

## Quick Start

Requirements:

- Windows 10/11 (x64) laptop
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) to build (the installer can bundle the runtime with `-SelfContained`)
- An administrator account for installation

Install from source:

```powershell
git clone <this repository>
cd capsomnia-windows
# from an elevated (administrator) PowerShell:
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

The installer publishes `Capsomnia.exe` and the helper to `C:\Program Files\Capsomnia`, registers two on-demand elevated scheduled tasks (`Capsomnia Lid On` / `Capsomnia Lid Off`), enables start-at-login, and starts the app. Uninstall with `scripts\uninstall.ps1`.

## What It Does

- **Caps Lock on**: keeps work from being interrupted when the laptop lid is closed. The tray dot lights up green.
- **Caps Lock off**: restores normal sleep behavior.
- **Lid closed while Caps Lock is on**: optionally turns only the displays off while work keeps running.
- **Quitting the app** restores normal sleep behavior.

## How It Works (macOS → Windows mapping)

| Original (macOS) | This port (Windows) |
|---|---|
| Caps Lock via `CGEventSource` (250 ms poll) | `GetKeyState(VK_CAPITAL)` (250 ms poll) |
| `pmset -a disablesleep` via root helper | `SetThreadExecutionState(ES_SYSTEM_REQUIRED)` for idle sleep **plus** the helper switching the power plan's lid-close action to *Do nothing* via `powercfg` |
| Narrow `sudoers` rule for the helper | Two on-demand scheduled tasks running the helper elevated with fixed arguments — no UAC prompt per toggle |
| `pmset -g` state verification & drift retry | `powercfg /query … LIDACTION` parsing, same verify/backoff/drift logic |
| Clamshell state via IOKit | `GUID_LIDSWITCH_STATE_CHANGE` power notifications |
| `pmset displaysleepnow` | `SC_MONITORPOWER` broadcast from the user session |
| LaunchAgent | `HKCU\...\Run` registry key |
| Menu bar LED dot | Tray `NotifyIcon` LED dot (green = awake, gray = normal, red = error) |

The helper backs up your current lid-close setting before changing it and restores it on Caps Lock off, on quit, and at uninstall. Settings: English / 日本語 / 한국어, launch at login, tray icon visibility, display-off on lid close.

## Building and Testing

```sh
dotnet build Capsomnia.sln        # cross-platform: core, helper, tests, GUI compile check
dotnet test Capsomnia.sln         # unit tests for parser / state machine / preferences / strings
dotnet build src/Capsomnia        # the real WinForms app — requires a Windows .NET SDK
```

The solution builds on Linux/macOS too: `tests/Capsomnia.App.CompileCheck` type-checks the GUI sources against the WindowsDesktop reference assemblies, since only a Windows SDK can produce the runnable `Capsomnia.exe`.

### Verifying on a real Windows machine

1. Turn Caps Lock **on** → `powercfg /requests` lists a SYSTEM request from Capsomnia, and `powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION` shows index `0x00000000` for AC and DC. Tray dot is green.
2. Close the lid → the machine stays reachable (e.g. over SSH/RDP); with the display preference on, screens turn off.
3. Turn Caps Lock **off** → the lid action indexes return to their previous values. Tray dot is gray.
4. Quit the app while Caps Lock is on → lid action is restored.

## Usage Notes & Windows-specific Limitations

- Ensure sufficient airflow and use a stable power source; closed-lid use may increase heat and battery consumption. Do not rely on Capsomnia for critical jobs.
- Blocking lid-close sleep is impossible with the standard keep-awake API alone, which is why installation needs administrator approval once for the helper tasks.
- On Modern Standby (S0ix) devices, closed-lid behavior can vary with vendor firmware.
- The helper tasks run as the installing user with highest privileges; that account must be an administrator.
- If the app is force-killed while Caps Lock is on, the lid action can be left at *Do nothing*. It self-heals on next launch (the app applies the live Caps Lock state at startup), or run `capsomnia-power-helper off` manually.
- On desktops without a lid setting, Capsomnia falls back to idle-sleep prevention only.

## Credits & License

Port of [fuji-mak/Capsomnia](https://github.com/fuji-mak/Capsomnia) (MIT License). This port is likewise MIT licensed.
