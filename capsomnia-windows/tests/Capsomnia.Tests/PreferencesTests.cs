using Capsomnia.Core;
using Xunit;

namespace Capsomnia.Tests;

public class PreferencesTests : IDisposable
{
    private readonly string _directory =
        Path.Combine(Path.GetTempPath(), "capsomnia-tests", Guid.NewGuid().ToString("N"));

    private string PreferencesPath => Path.Combine(_directory, "preferences.json");

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    [Fact]
    public void DefaultsMatchOriginalApp()
    {
        var store = new PreferencesStore(PreferencesPath);

        Assert.True(store.Data.ShowTrayIcon);
        Assert.True(store.Data.LaunchAtLogin);
        Assert.True(store.Data.DisplaySleepOnLidClose);
        Assert.False(store.Data.DidCompleteInitialSetup);
        Assert.False(store.Data.ForceWelcomeOnNextLaunch);
    }

    [Fact]
    public void RoundTripsAllValues()
    {
        var store = new PreferencesStore(PreferencesPath);
        store.Data.ShowTrayIcon = false;
        store.Data.AppLanguage = AppLanguage.Korean;
        store.Data.LaunchAtLogin = false;
        store.Data.DisplaySleepOnLidClose = false;
        store.Data.DidCompleteInitialSetup = true;
        store.Save();

        var reloaded = new PreferencesStore(PreferencesPath);

        Assert.False(reloaded.Data.ShowTrayIcon);
        Assert.Equal(AppLanguage.Korean, reloaded.Data.AppLanguage);
        Assert.False(reloaded.Data.LaunchAtLogin);
        Assert.False(reloaded.Data.DisplaySleepOnLidClose);
        Assert.True(reloaded.Data.DidCompleteInitialSetup);
    }

    [Fact]
    public void CorruptedFileFallsBackToDefaults()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(PreferencesPath, "{ not json");

        var store = new PreferencesStore(PreferencesPath);

        Assert.True(store.Data.ShowTrayIcon);
    }

    [Fact]
    public void ConsumeForceWelcomeClearsTheFlag()
    {
        var store = new PreferencesStore(PreferencesPath);
        store.Data.ForceWelcomeOnNextLaunch = true;
        store.Save();

        var reloaded = new PreferencesStore(PreferencesPath);
        Assert.True(reloaded.ConsumeForceWelcomeOnNextLaunch());
        Assert.False(reloaded.ConsumeForceWelcomeOnNextLaunch());

        var reloadedAgain = new PreferencesStore(PreferencesPath);
        Assert.False(reloadedAgain.Data.ForceWelcomeOnNextLaunch);
    }

    [Fact]
    public void UnknownLanguageCodeFallsBackToEnglish()
    {
        var store = new PreferencesStore(PreferencesPath);
        store.Data.Language = "fr";

        Assert.Equal(AppLanguage.English, store.Data.AppLanguage);
    }
}
