using Capsomnia.App.Interop;
using Capsomnia.Core;
using Microsoft.Win32;

namespace Capsomnia.App;

/// <summary>
/// The running tray app: polls Caps Lock every 250 ms (same cadence as the
/// original), drives the sleep state machine, and owns the tray icon, menu,
/// and settings window.
/// </summary>
internal sealed class CapsomniaAppContext : ApplicationContext
{
    private readonly Logger _logger = new();
    private readonly PreferencesStore _preferences;
    private readonly LidStateMonitor _lidStateMonitor = new();
    private readonly SleepController _sleepController;
    private readonly SleepStateMachine _stateMachine;
    private readonly TrayIcons _icons = new();
    private readonly System.Windows.Forms.Timer _pollingTimer = new();
    private readonly Control _uiThreadInvoker = new();
    private NotifyIcon? _notifyIcon;
    private SettingsForm? _settingsForm;
    private bool _restoredOnExit;

    public CapsomniaAppContext()
    {
        _preferences = new PreferencesStore(
            PreferencesStore.DefaultPath(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)));

        // Forces handle creation on the UI thread so background threads can
        // marshal calls onto it.
        _uiThreadInvoker.CreateControl();

        _sleepController = new SleepController(_logger, _lidStateMonitor);
        _stateMachine = new SleepStateMachine(_sleepController)
        {
            DisplaySleepOnLidClose = _preferences.Data.DisplaySleepOnLidClose,
        };

        var showInitialSetup = _preferences.ConsumeForceWelcomeOnNextLaunch()
            || !_preferences.Data.DidCompleteInitialSetup;

        SyncTrayIconVisibility();

        Application.ApplicationExit += (_, _) => RestoreSleepState("terminate");
        SystemEvents.SessionEnding += (_, _) => RestoreSleepState("session_ending");
        _lidStateMonitor.Changed += () => ApplyCurrentCapsLockState("lid_event");

        _pollingTimer.Interval = 250;
        _pollingTimer.Tick += (_, _) => ApplyCurrentCapsLockState("poll");
        _pollingTimer.Start();

        _logger.Log("start");
        _logger.Log("polling_ready interval_ms=250");
        ApplyCurrentCapsLockState("startup");

        if (showInitialSetup)
        {
            ShowSettingsWindow(SettingsPage.InitialPreferences);
        }
    }

    /// <summary>Safe to call from any thread (used by the second-instance watcher).</summary>
    public void OpenSettingsFromOtherThread()
    {
        try
        {
            _uiThreadInvoker.BeginInvoke(() => ShowSettingsWindow(CurrentSettingsPage()));
        }
        catch (Exception ex) when (ex is ObjectDisposedException or InvalidOperationException)
        {
            // The app is shutting down.
        }
    }

    private void ApplyCurrentCapsLockState(string reason)
    {
        var capsLockOn = NativeMethods.IsCapsLockOn();
        _stateMachine.Apply(capsLockOn, reason, DateTime.UtcNow);
        RefreshStatus(capsLockOn);
    }

    private void SyncTrayIconVisibility()
    {
        if (_preferences.Data.ShowTrayIcon)
        {
            if (_notifyIcon is null)
            {
                _notifyIcon = new NotifyIcon { Visible = true };
                _notifyIcon.DoubleClick += (_, _) => ShowSettingsWindow(CurrentSettingsPage());
                RebuildTrayMenu();
            }

            RefreshStatus(NativeMethods.IsCapsLockOn());
        }
        else if (_notifyIcon is not null)
        {
            _notifyIcon.Visible = false;
            _notifyIcon.Dispose();
            _notifyIcon = null;
        }
    }

    private void RebuildTrayMenu()
    {
        if (_notifyIcon is null)
        {
            return;
        }

        var strings = AppStrings.For(_preferences.Data.AppLanguage);
        var menu = new ContextMenuStrip();

        var showTrayIconItem = new ToolStripMenuItem(strings.ShowTrayIcon)
        {
            Checked = _preferences.Data.ShowTrayIcon,
        };
        showTrayIconItem.Click += (_, _) => SetShowTrayIcon(!_preferences.Data.ShowTrayIcon);
        menu.Items.Add(showTrayIconItem);

        var languageItem = new ToolStripMenuItem(strings.Language);
        foreach (var language in Enum.GetValues<AppLanguage>())
        {
            var item = new ToolStripMenuItem(language.DisplayName())
            {
                Checked = _preferences.Data.AppLanguage == language,
            };
            var capturedLanguage = language;
            item.Click += (_, _) => SetLanguage(capturedLanguage);
            languageItem.DropDownItems.Add(item);
        }

        menu.Items.Add(languageItem);

        var openItem = new ToolStripMenuItem(strings.OpenCapsomnia);
        openItem.Click += (_, _) => ShowSettingsWindow(CurrentSettingsPage());
        menu.Items.Add(openItem);

        menu.Items.Add(new ToolStripSeparator());

        var quitItem = new ToolStripMenuItem(strings.Quit);
        quitItem.Click += (_, _) =>
        {
            _logger.Log("menu_quit");
            ExitThread();
        };
        menu.Items.Add(quitItem);

        _notifyIcon.ContextMenuStrip = menu;
    }

    private void ShowSettingsWindow(SettingsPage page)
    {
        _settingsForm ??= new SettingsForm(
            _preferences,
            onShowTrayIconChange: SetShowTrayIcon,
            onLanguageChange: SetLanguage,
            onLaunchAtLoginChange: SetLaunchAtLogin,
            onDisplaySleepOnLidCloseChange: SetDisplaySleepOnLidClose,
            onFinishInitialSetup: () =>
            {
                _preferences.Data.DidCompleteInitialSetup = true;
                _preferences.Save();
                _logger.Log("initial_setup_complete");
            });

        _settingsForm.ShowPage(page);
    }

    private SettingsPage CurrentSettingsPage() =>
        _preferences.Data.DidCompleteInitialSetup ? SettingsPage.Settings : SettingsPage.InitialPreferences;

    private void SetShowTrayIcon(bool enabled)
    {
        _preferences.Data.ShowTrayIcon = enabled;
        _preferences.Save();
        SyncTrayIconVisibility();
        RebuildTrayMenu();
        _logger.Log($"preference show_tray_icon={(enabled ? "on" : "off")}");
    }

    private void SetLanguage(AppLanguage language)
    {
        if (_preferences.Data.AppLanguage == language)
        {
            return;
        }

        _preferences.Data.AppLanguage = language;
        _preferences.Save();
        RebuildTrayMenu();
        RefreshStatus(NativeMethods.IsCapsLockOn());
        _settingsForm?.ReloadText();
        _logger.Log($"preference language={language.Code()}");
    }

    private void SetLaunchAtLogin(bool enabled)
    {
        try
        {
            StartupManager.SetEnabled(enabled);
            _preferences.Data.LaunchAtLogin = enabled;
            _preferences.Save();
            _logger.Log($"preference launch_at_login={(enabled ? "on" : "off")}");
        }
        catch (Exception ex)
        {
            _logger.Log($"preference launch_at_login_error={ex.Message}");
        }
    }

    private void SetDisplaySleepOnLidClose(bool enabled)
    {
        _preferences.Data.DisplaySleepOnLidClose = enabled;
        _preferences.Save();
        _stateMachine.DisplaySleepOnLidClose = enabled;
        _logger.Log($"preference display_sleep_on_lid_close={(enabled ? "on" : "off")}");
    }

    private void RefreshStatus(bool capsLockOn)
    {
        if (_notifyIcon is null)
        {
            return;
        }

        var strings = AppStrings.For(_preferences.Data.AppLanguage);
        if (_stateMachine.HasError)
        {
            _notifyIcon.Icon = _icons.Error;
            _notifyIcon.Text = Truncate(strings.TooltipError);
        }
        else
        {
            _notifyIcon.Icon = capsLockOn ? _icons.On : _icons.Off;
            _notifyIcon.Text = Truncate(capsLockOn ? strings.TooltipOn : strings.TooltipOff);
        }
    }

    // NotifyIcon.Text throws over 63 characters.
    private static string Truncate(string text) => text.Length <= 63 ? text : text[..63];

    private void RestoreSleepState(string reason)
    {
        if (_restoredOnExit)
        {
            return;
        }

        _restoredOnExit = true;
        _pollingTimer.Stop();
        var succeeded = _sleepController.RunHelper(SleepHelperMode.Off);
        _sleepController.ReleaseExecutionState();
        _logger.Log($"{reason} restore_off helper_ok={succeeded}");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            RestoreSleepState("dispose");
            _pollingTimer.Dispose();
            _notifyIcon?.Dispose();
            _icons.Dispose();
            _lidStateMonitor.Dispose();
            _settingsForm?.Dispose();
            _uiThreadInvoker.Dispose();
        }

        base.Dispose(disposing);
    }
}
