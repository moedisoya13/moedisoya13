using Capsomnia.Core;

namespace Capsomnia.App;

internal enum SettingsPage
{
    InitialPreferences,
    Settings,
}

/// <summary>
/// Settings window in the brand's dark look: the welcome/initial-setup page and
/// the regular preferences page. Port of the original SettingsWindowController.
/// </summary>
internal sealed class SettingsForm : Form
{
    private readonly PreferencesStore _preferences;
    private readonly Action<bool> _onShowTrayIconChange;
    private readonly Action<AppLanguage> _onLanguageChange;
    private readonly Action<bool> _onLaunchAtLoginChange;
    private readonly Action<bool> _onDisplaySleepOnLidCloseChange;
    private readonly Action _onFinishInitialSetup;

    private SettingsPage _page;
    private bool _loadingControls;

    private readonly Label _titleLabel = new();
    private readonly Label _explainerOnTitle = new();
    private readonly Label _explainerOnDesc = new();
    private readonly Label _explainerOffTitle = new();
    private readonly Label _explainerOffDesc = new();
    private readonly Label _preferencesHeading = new();
    private readonly CheckBox _showTrayIconCheck = new();
    private readonly Label _showTrayIconDesc = new();
    private readonly CheckBox _launchAtLoginCheck = new();
    private readonly Label _launchAtLoginDesc = new();
    private readonly CheckBox _displaySleepCheck = new();
    private readonly Label _displaySleepDesc = new();
    private readonly Label _languageLabel = new();
    private readonly ComboBox _languageCombo = new();
    private readonly Label _noteLabel = new();
    private readonly Button _primaryButton = new();

    public SettingsForm(
        PreferencesStore preferences,
        Action<bool> onShowTrayIconChange,
        Action<AppLanguage> onLanguageChange,
        Action<bool> onLaunchAtLoginChange,
        Action<bool> onDisplaySleepOnLidCloseChange,
        Action onFinishInitialSetup)
    {
        _preferences = preferences;
        _onShowTrayIconChange = onShowTrayIconChange;
        _onLanguageChange = onLanguageChange;
        _onLaunchAtLoginChange = onLaunchAtLoginChange;
        _onDisplaySleepOnLidCloseChange = onDisplaySleepOnLidCloseChange;
        _onFinishInitialSetup = onFinishInitialSetup;

        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Brand.Bg;
        ForeColor = Brand.Text;
        ClientSize = new Size(460, 560);
        Font = new Font("Segoe UI", 9.5f);

        BuildLayout();

        // Closing the window hides it; the tray app keeps running.
        FormClosing += (_, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
    }

    private void BuildLayout()
    {
        var padding = 24;
        var y = padding;

        _titleLabel.Font = new Font("Segoe UI Semibold", 15f);
        _titleLabel.AutoSize = false;
        _titleLabel.SetBounds(padding, y, ClientSize.Width - 2 * padding, 34);
        y += 46;

        foreach (var (title, desc) in new[]
                 {
                     (_explainerOnTitle, _explainerOnDesc),
                     (_explainerOffTitle, _explainerOffDesc),
                 })
        {
            title.Font = new Font("Segoe UI Semibold", 10f);
            title.ForeColor = Brand.Led;
            title.SetBounds(padding, y, ClientSize.Width - 2 * padding, 20);
            y += 22;
            desc.ForeColor = Brand.TextDim;
            desc.SetBounds(padding, y, ClientSize.Width - 2 * padding, 34);
            y += 40;
        }

        _preferencesHeading.Font = new Font("Segoe UI Semibold", 10.5f);
        _preferencesHeading.SetBounds(padding, y, ClientSize.Width - 2 * padding, 22);
        y += 28;

        foreach (var (check, desc, handler) in new (CheckBox, Label, Action<bool>)[]
                 {
                     (_showTrayIconCheck, _showTrayIconDesc, v => _onShowTrayIconChange(v)),
                     (_launchAtLoginCheck, _launchAtLoginDesc, v => _onLaunchAtLoginChange(v)),
                     (_displaySleepCheck, _displaySleepDesc, v => _onDisplaySleepOnLidCloseChange(v)),
                 })
        {
            check.SetBounds(padding, y, ClientSize.Width - 2 * padding, 22);
            check.ForeColor = Brand.Text;
            var capturedHandler = handler;
            var capturedCheck = check;
            check.CheckedChanged += (_, _) =>
            {
                if (!_loadingControls)
                {
                    capturedHandler(capturedCheck.Checked);
                }
            };
            y += 24;
            desc.ForeColor = Brand.TextDim;
            desc.SetBounds(padding + 18, y, ClientSize.Width - 2 * padding - 18, 30);
            y += 34;
        }

        _languageLabel.SetBounds(padding, y + 4, 120, 22);
        _languageCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _languageCombo.FlatStyle = FlatStyle.Flat;
        _languageCombo.BackColor = Brand.Surface;
        _languageCombo.ForeColor = Brand.Text;
        _languageCombo.SetBounds(padding + 130, y, 160, 26);
        foreach (var language in Enum.GetValues<AppLanguage>())
        {
            _languageCombo.Items.Add(language.DisplayName());
        }

        _languageCombo.SelectedIndexChanged += (_, _) =>
        {
            if (!_loadingControls && _languageCombo.SelectedIndex >= 0)
            {
                _onLanguageChange((AppLanguage)_languageCombo.SelectedIndex);
            }
        };
        y += 40;

        _noteLabel.ForeColor = Brand.TextDim;
        _noteLabel.SetBounds(padding, y, ClientSize.Width - 2 * padding, 58);
        y += 66;

        _primaryButton.FlatStyle = FlatStyle.Flat;
        _primaryButton.FlatAppearance.BorderColor = Brand.Border;
        _primaryButton.BackColor = Brand.Led;
        _primaryButton.ForeColor = Brand.Bg;
        _primaryButton.Font = new Font("Segoe UI Semibold", 10f);
        _primaryButton.SetBounds(padding, y, ClientSize.Width - 2 * padding, 36);
        _primaryButton.Click += (_, _) =>
        {
            if (_page == SettingsPage.InitialPreferences)
            {
                _onFinishInitialSetup();
                _page = SettingsPage.Settings;
                ReloadText();
            }

            Hide();
        };

        Controls.AddRange(
        [
            _titleLabel,
            _explainerOnTitle, _explainerOnDesc,
            _explainerOffTitle, _explainerOffDesc,
            _preferencesHeading,
            _showTrayIconCheck, _showTrayIconDesc,
            _launchAtLoginCheck, _launchAtLoginDesc,
            _displaySleepCheck, _displaySleepDesc,
            _languageLabel, _languageCombo,
            _noteLabel,
            _primaryButton,
        ]);
    }

    public void ShowPage(SettingsPage page)
    {
        _page = page;
        ReloadText();
        LoadValues();
        Show();
        Activate();
    }

    public void ReloadText()
    {
        var strings = AppStrings.For(_preferences.Data.AppLanguage);
        Text = $"Capsomnia — {strings.SettingsTitle}";
        _titleLabel.Text = _page == SettingsPage.InitialPreferences ? strings.WelcomeTitle : strings.SettingsTitle;
        _explainerOnTitle.Text = strings.ExplainerOnTitle;
        _explainerOnDesc.Text = strings.ExplainerOnDesc;
        _explainerOffTitle.Text = strings.ExplainerOffTitle;
        _explainerOffDesc.Text = strings.ExplainerOffDesc;
        _preferencesHeading.Text = strings.PreferencesHeading;
        _showTrayIconCheck.Text = strings.ShowTrayIcon;
        _showTrayIconDesc.Text = strings.ShowTrayIconDesc;
        _launchAtLoginCheck.Text = strings.OpenAtLogin;
        _launchAtLoginDesc.Text = strings.OpenAtLoginDesc;
        _displaySleepCheck.Text = strings.DisplaySleepOnLidClose;
        _displaySleepDesc.Text = strings.DisplaySleepOnLidCloseDesc;
        _languageLabel.Text = strings.Language;
        _noteLabel.Text = strings.InitialSettingsNote;
        _primaryButton.Text = _page == SettingsPage.InitialPreferences ? strings.GetStarted : strings.Done;
    }

    private void LoadValues()
    {
        _loadingControls = true;
        try
        {
            _showTrayIconCheck.Checked = _preferences.Data.ShowTrayIcon;
            _launchAtLoginCheck.Checked = _preferences.Data.LaunchAtLogin;
            _displaySleepCheck.Checked = _preferences.Data.DisplaySleepOnLidClose;
            _languageCombo.SelectedIndex = (int)_preferences.Data.AppLanguage;
        }
        finally
        {
            _loadingControls = false;
        }
    }
}
