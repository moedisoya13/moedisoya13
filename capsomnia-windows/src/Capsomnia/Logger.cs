using System.Globalization;

namespace Capsomnia.App;

/// <summary>
/// Appends timestamped lines to %LOCALAPPDATA%\Capsomnia\Logs\capsomnia.log,
/// matching the original app's log format.
/// </summary>
internal sealed class Logger
{
    private readonly string _path;
    private readonly object _lock = new();

    public Logger()
        : this(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Capsomnia",
            "Logs",
            "capsomnia.log"))
    {
    }

    public Logger(string path)
    {
        _path = path;
    }

    public void Log(string message)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
        try
        {
            lock (_lock)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                File.AppendAllText(_path, $"{timestamp} {message}{Environment.NewLine}");
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Logging must never take the app down.
        }
    }
}
