namespace Capsomnia.App;

internal static class Program
{
    private const string MutexName = @"Local\CapsomniaSingleton";
    private const string OpenSettingsEventName = @"Local\CapsomniaOpenSettings";

    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var isFirstInstance);
        using var openSettingsEvent = new EventWaitHandle(
            initialState: false,
            EventResetMode.AutoReset,
            OpenSettingsEventName);

        if (!isFirstInstance)
        {
            // Counterpart of the original duplicate-instance handling: wake the
            // existing instance's settings window and exit without touching the
            // sleep state.
            openSettingsEvent.Set();
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        var context = new CapsomniaAppContext();

        var watcherThread = new Thread(() =>
        {
            while (openSettingsEvent.WaitOne())
            {
                context.OpenSettingsFromOtherThread();
            }
        })
        {
            IsBackground = true,
        };
        watcherThread.Start();

        Application.Run(context);
    }
}
