using System.Runtime.InteropServices;

namespace Capsomnia.App.Interop;

internal static class NativeMethods
{
    public const int VkCapital = 0x14;

    public const uint EsContinuous = 0x80000000;
    public const uint EsSystemRequired = 0x00000001;

    public const int WmPowerBroadcast = 0x0218;
    public const int PbtPowerSettingChange = 0x8013;

    public const int WmSysCommand = 0x0112;
    public const int ScMonitorPower = 0xF170;
    public const int MonitorOff = 2;
    public const uint SmtoAbortIfHung = 0x0002;

    public static readonly IntPtr HwndBroadcast = new(0xFFFF);

    /// <summary>GUID_LIDSWITCH_STATE_CHANGE: payload is 0 when the lid closes, 1 when it opens.</summary>
    public static readonly Guid GuidLidSwitchStateChange = new("BA3E0F4D-B817-4094-A2D1-D56379E6A0F3");

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PowerBroadcastSetting
    {
        public Guid PowerSetting;
        public uint DataLength;
        public byte Data;
    }

    [DllImport("user32.dll")]
    public static extern short GetKeyState(int nVirtKey);

    [DllImport("kernel32.dll")]
    public static extern uint SetThreadExecutionState(uint esFlags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr RegisterPowerSettingNotification(
        IntPtr hRecipient,
        ref Guid powerSettingGuid,
        int flags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterPowerSettingNotification(IntPtr handle);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        int msg,
        IntPtr wParam,
        IntPtr lParam,
        uint fuFlags,
        uint uTimeout,
        out IntPtr lpdwResult);

    public static bool IsCapsLockOn() => (GetKeyState(VkCapital) & 1) == 1;
}
