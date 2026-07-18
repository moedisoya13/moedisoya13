using System.Runtime.InteropServices;
using Capsomnia.App.Interop;

namespace Capsomnia.App;

/// <summary>
/// Tracks the laptop lid state via GUID_LIDSWITCH_STATE_CHANGE power-setting
/// notifications. Windows counterpart of the original ClamshellStateReader
/// (IOKit AppleClamshellState). Windows delivers the current state immediately
/// after registration, then again on every change.
/// </summary>
internal sealed class LidStateMonitor : NativeWindow, IDisposable
{
    private IntPtr _notificationHandle;

    /// <summary>Null until the first notification arrives (e.g. desktops without a lid).</summary>
    public bool? IsClosed { get; private set; }

    public event Action? Changed;

    public LidStateMonitor()
    {
        // Message-only windows don't receive WM_POWERBROADCAST, so create a
        // plain hidden top-level window instead.
        CreateHandle(new CreateParams());
        var guid = NativeMethods.GuidLidSwitchStateChange;
        _notificationHandle = NativeMethods.RegisterPowerSettingNotification(Handle, ref guid, 0);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == NativeMethods.WmPowerBroadcast
            && m.WParam == NativeMethods.PbtPowerSettingChange
            && m.LParam != IntPtr.Zero)
        {
            var setting = Marshal.PtrToStructure<NativeMethods.PowerBroadcastSetting>(m.LParam);
            if (setting.PowerSetting == NativeMethods.GuidLidSwitchStateChange && setting.DataLength >= 1)
            {
                IsClosed = setting.Data == 0;
                Changed?.Invoke();
            }
        }

        base.WndProc(ref m);
    }

    public void Dispose()
    {
        if (_notificationHandle != IntPtr.Zero)
        {
            NativeMethods.UnregisterPowerSettingNotification(_notificationHandle);
            _notificationHandle = IntPtr.Zero;
        }

        if (Handle != IntPtr.Zero)
        {
            DestroyHandle();
        }
    }
}
