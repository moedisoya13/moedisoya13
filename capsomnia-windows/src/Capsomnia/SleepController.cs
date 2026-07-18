using System.Diagnostics;
using Capsomnia.App.Interop;
using Capsomnia.Core;

namespace Capsomnia.App;

/// <summary>
/// Real ISleepActions implementation. Keep-awake is applied in two layers:
///
/// 1. SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) blocks idle
///    sleep. It is process-local, needs no privileges, and Windows clears it
///    automatically if the process dies.
/// 2. Lid-close sleep cannot be blocked by execution states, so the elevated
///    helper (via the on-demand scheduled tasks that install.ps1 registers)
///    switches the power plan's lid-close action to "do nothing" and back.
///    This is the counterpart of the original sudoers + capsomnia-pmset design.
///
/// On devices without a lid-close power setting (desktops), the controller
/// falls back to execution-state-only mode and reports that state as applied.
/// </summary>
internal sealed class SleepController : ISleepActions
{
    public const string TaskNameOn = "Capsomnia Lid On";
    public const string TaskNameOff = "Capsomnia Lid Off";

    private static readonly TimeSpan HelperConfirmationTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan HelperConfirmationPollInterval = TimeSpan.FromMilliseconds(300);

    private readonly Logger _logger;
    private readonly LidStateMonitor _lidStateMonitor;
    private readonly bool _hasLidSetting;
    private bool _executionStateKeepAwake;

    public SleepController(Logger logger, LidStateMonitor lidStateMonitor)
    {
        _logger = logger;
        _lidStateMonitor = lidStateMonitor;
        _hasLidSetting = QueryLidActions() is not null;
        if (!_hasLidSetting)
        {
            _logger.Log("lid_setting_unavailable falling_back_to_execution_state_only");
        }
    }

    public bool RunHelper(SleepHelperMode mode)
    {
        ApplyExecutionState(mode == SleepHelperMode.On);
        if (!_hasLidSetting)
        {
            return true;
        }

        var taskName = mode == SleepHelperMode.On ? TaskNameOn : TaskNameOff;
        var (status, _, stderr) = RunCommand("schtasks", "/run", "/tn", taskName);
        if (status != 0)
        {
            _logger.Log($"schtasks_run task=\"{taskName}\" status={status} stderr={stderr}");
            return false;
        }

        // schtasks /run returns before the task finishes, so wait briefly for
        // powercfg to reflect the requested state.
        var expected = mode == SleepHelperMode.On;
        var deadline = DateTime.UtcNow + HelperConfirmationTimeout;
        while (DateTime.UtcNow < deadline)
        {
            if (ReadLidSleepDisabled() == expected)
            {
                return true;
            }

            Thread.Sleep(HelperConfirmationPollInterval);
        }

        return ReadLidSleepDisabled() == expected;
    }

    public bool? ReadLidSleepDisabled()
    {
        if (!_hasLidSetting)
        {
            // Execution-state-only mode: the ES flags are process-local and
            // cannot drift, so the last applied value is the actual state.
            return _executionStateKeepAwake;
        }

        return QueryLidActions()?.IsLidSleepDisabled;
    }

    public bool? ReadLidClosed() => _lidStateMonitor.IsClosed;

    public bool RequestDisplaySleep()
    {
        // Must be sent from the interactive session, hence the app rather than
        // the elevated helper (counterpart of `pmset displaysleepnow`).
        var result = NativeMethods.SendMessageTimeout(
            NativeMethods.HwndBroadcast,
            NativeMethods.WmSysCommand,
            NativeMethods.ScMonitorPower,
            NativeMethods.MonitorOff,
            NativeMethods.SmtoAbortIfHung,
            1000,
            out _);
        return result != IntPtr.Zero;
    }

    public void Log(string message) => _logger.Log(message);

    /// <summary>Clears the keep-awake execution state; called on app exit.</summary>
    public void ReleaseExecutionState() => ApplyExecutionState(false);

    private void ApplyExecutionState(bool keepAwake)
    {
        var flags = keepAwake
            ? NativeMethods.EsContinuous | NativeMethods.EsSystemRequired
            : NativeMethods.EsContinuous;
        NativeMethods.SetThreadExecutionState(flags);
        _executionStateKeepAwake = keepAwake;
    }

    private static LidActionState? QueryLidActions()
    {
        var (status, stdout, _) = RunCommand("powercfg", "/query", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION");
        if (status != 0)
        {
            return null;
        }

        return LidActionParser.Parse(stdout);
    }

    private static (int Status, string Stdout, string Stderr) RunCommand(string fileName, params string[] arguments)
    {
        var startInfo = new ProcessStartInfo(fileName)
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

        try
        {
            using var process = Process.Start(startInfo);
            if (process is null)
            {
                return (-1, "", $"could not start {fileName}");
            }

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return (process.ExitCode, stdout, stderr.Trim());
        }
        catch (Exception ex)
        {
            return (-1, "", ex.Message);
        }
    }
}
