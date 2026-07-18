using System.Diagnostics;
using System.Text.Json;
using Capsomnia.Core;

// Windows port of the original capsomnia-pmset privileged helper.
// macOS toggled `pmset -a disablesleep`; on Windows the lid-close action is a
// power-plan setting, so `on` backs up the current AC/DC lid actions and sets
// both to "do nothing" (0), and `off` restores the backup. The helper is meant
// to run elevated via the scheduled tasks that scripts/install.ps1 registers.
//
// Exit codes mirror the original: 0 success, 64 usage, 70 execution failure.

const string Usage = "usage: capsomnia-power-helper on|off\n";
const int LidActionSleep = 1;

string backupPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
    "Capsomnia",
    "lid-backup.json");

if (args.Length != 1)
{
    Console.Error.Write(Usage);
    return 64;
}

try
{
    switch (args[0])
    {
        case "on":
            BackupCurrentLidActions();
            return SetLidActions(new LidActionState(0, 0));
        case "off":
            var restored = ReadBackup() ?? new LidActionState(LidActionSleep, LidActionSleep);
            var status = SetLidActions(restored);
            if (status == 0 && File.Exists(backupPath))
            {
                File.Delete(backupPath);
            }

            return status;
        default:
            Console.Error.Write(Usage);
            return 64;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"capsomnia-power-helper: {ex.Message}");
    return 70;
}

void BackupCurrentLidActions()
{
    // Keep the oldest backup: if "on" runs twice without an "off" in between,
    // overwriting would capture our own 0/0 and lose the user's real setting.
    if (File.Exists(backupPath))
    {
        return;
    }

    var (queryStatus, stdout, _) = RunPowercfg("/query", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION");
    if (queryStatus != 0)
    {
        return;
    }

    var current = LidActionParser.Parse(stdout);
    if (current is null || current.Value.IsLidSleepDisabled)
    {
        return;
    }

    Directory.CreateDirectory(Path.GetDirectoryName(backupPath)!);
    File.WriteAllText(backupPath, JsonSerializer.Serialize(current.Value));
}

LidActionState? ReadBackup()
{
    try
    {
        if (File.Exists(backupPath))
        {
            return JsonSerializer.Deserialize<LidActionState>(File.ReadAllText(backupPath));
        }
    }
    catch (Exception ex) when (ex is IOException or JsonException)
    {
        // A corrupted backup falls through to the sleep default.
    }

    return null;
}

int SetLidActions(LidActionState state)
{
    string[][] commands =
    [
        ["/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", state.Ac.ToString()],
        ["/setdcvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", state.Dc.ToString()],
        ["/setactive", "SCHEME_CURRENT"],
    ];

    foreach (var command in commands)
    {
        var (status, _, stderr) = RunPowercfg(command);
        if (status != 0)
        {
            Console.Error.WriteLine($"capsomnia-power-helper: powercfg {string.Join(' ', command)} failed: {stderr}");
            return 70;
        }
    }

    return 0;
}

static (int Status, string Stdout, string Stderr) RunPowercfg(params string[] arguments)
{
    var startInfo = new ProcessStartInfo("powercfg")
    {
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true,
    };
    foreach (var argument in arguments)
    {
        startInfo.ArgumentList.Add(argument);
    }

    using var process = Process.Start(startInfo)
        ?? throw new InvalidOperationException("could not start powercfg");
    var stdout = process.StandardOutput.ReadToEnd();
    var stderr = process.StandardError.ReadToEnd();
    process.WaitForExit();
    return (process.ExitCode, stdout, stderr);
}
