using System.Text.Json;
using System.Text.Json.Serialization;

namespace Capsomnia.Core;

/// <summary>
/// Persisted user preferences. Windows port of the original UserDefaults-backed
/// Preferences, stored as JSON under %APPDATA%\Capsomnia.
/// </summary>
public sealed class PreferencesData
{
    public bool ShowTrayIcon { get; set; } = true;
    public string Language { get; set; } = AppLanguageExtensions.DefaultLanguage().Code();
    public bool LaunchAtLogin { get; set; } = true;
    public bool DisplaySleepOnLidClose { get; set; } = true;
    public bool DidCompleteInitialSetup { get; set; }
    public bool ForceWelcomeOnNextLaunch { get; set; }

    [JsonIgnore]
    public AppLanguage AppLanguage
    {
        get => AppLanguageExtensions.FromCode(Language);
        set => Language = value.Code();
    }
}

public sealed class PreferencesStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true,
    };

    private readonly string _path;

    public PreferencesStore(string path)
    {
        _path = path;
        Data = Load(path);
    }

    public PreferencesData Data { get; }

    public static string DefaultPath(string appDataDirectory) =>
        Path.Combine(appDataDirectory, "Capsomnia", "preferences.json");

    private static PreferencesData Load(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                return JsonSerializer.Deserialize<PreferencesData>(File.ReadAllText(path))
                    ?? new PreferencesData();
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            // Corrupted or unreadable preferences fall back to defaults.
        }

        return new PreferencesData();
    }

    public void Save()
    {
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(_path, JsonSerializer.Serialize(Data, SerializerOptions));
    }

    /// <summary>Port of consumeForceWelcomeOnNextLaunch: reads and clears the flag.</summary>
    public bool ConsumeForceWelcomeOnNextLaunch()
    {
        if (!Data.ForceWelcomeOnNextLaunch)
        {
            return false;
        }

        Data.ForceWelcomeOnNextLaunch = false;
        Save();
        return true;
    }
}
