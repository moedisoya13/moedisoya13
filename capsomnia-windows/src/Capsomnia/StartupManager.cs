using Microsoft.Win32;

namespace Capsomnia.App;

/// <summary>
/// Launch-at-login via the per-user Run registry key. Windows counterpart of
/// the original LaunchAgentManager (launchctl enable/disable).
/// </summary>
internal static class StartupManager
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "Capsomnia";

    public static void SetEnabled(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath)
            ?? throw new InvalidOperationException($"could not open HKCU\\{RunKeyPath}");

        if (enabled)
        {
            key.SetValue(ValueName, $"\"{Application.ExecutablePath}\"");
        }
        else
        {
            key.DeleteValue(ValueName, throwOnMissingValue: false);
        }
    }
}
