using System.Globalization;

namespace Capsomnia.Core;

public enum AppLanguage
{
    English,
    Japanese,
    Korean,
}

public static class AppLanguageExtensions
{
    public static string Code(this AppLanguage language) => language switch
    {
        AppLanguage.Japanese => "ja",
        AppLanguage.Korean => "ko",
        _ => "en",
    };

    public static string DisplayName(this AppLanguage language) => language switch
    {
        AppLanguage.Japanese => "日本語",
        AppLanguage.Korean => "한국어",
        _ => "English",
    };

    public static AppLanguage FromCode(string? code) => code switch
    {
        "ja" => AppLanguage.Japanese,
        "ko" => AppLanguage.Korean,
        _ => AppLanguage.English,
    };

    public static AppLanguage DefaultLanguage(CultureInfo? culture = null)
    {
        var name = (culture ?? CultureInfo.CurrentUICulture).TwoLetterISOLanguageName;
        return name switch
        {
            "ja" => AppLanguage.Japanese,
            "ko" => AppLanguage.Korean,
            _ => AppLanguage.English,
        };
    }
}

/// <summary>
/// UI strings, ported from the original macOS AppStrings (en/ja) with Korean added.
/// </summary>
public sealed record AppStrings(
    string ShowTrayIcon,
    string ShowTrayIconDesc,
    string Language,
    string OpenAtLogin,
    string OpenAtLoginDesc,
    string DisplaySleepOnLidClose,
    string DisplaySleepOnLidCloseDesc,
    string OpenCapsomnia,
    string Quit,
    string SettingsTitle,
    string InitialSettingsNote,
    string WelcomeTitle,
    string ExplainerOnTitle,
    string ExplainerOnDesc,
    string ExplainerOffTitle,
    string ExplainerOffDesc,
    string PreferencesHeading,
    string Done,
    string GetStarted,
    string TooltipOn,
    string TooltipOff,
    string TooltipError)
{
    public static AppStrings For(AppLanguage language) => language switch
    {
        AppLanguage.Japanese => Japanese,
        AppLanguage.Korean => Korean,
        _ => English,
    };

    public static readonly AppStrings English = new(
        ShowTrayIcon: "Show tray icon",
        ShowTrayIconDesc: "Display the LED status dot in the notification area.",
        Language: "Language",
        OpenAtLogin: "Open at login",
        OpenAtLoginDesc: "Launch Capsomnia automatically after you sign in.",
        DisplaySleepOnLidClose: "Turn display off when lid closes",
        DisplaySleepOnLidCloseDesc: "When Caps Lock is on, keep work running but let the display sleep after closing the lid.",
        OpenCapsomnia: "Open Capsomnia",
        Quit: "Quit",
        SettingsTitle: "Settings",
        InitialSettingsNote: "Windows asks for administrator approval once, when the lid-close helper tasks are installed. Open Capsomnia again any time to change these settings.",
        WelcomeTitle: "Welcome to Capsomnia",
        ExplainerOnTitle: "Caps Lock on",
        ExplainerOnDesc: "System sleep is disabled — work keeps running, lid open or closed.",
        ExplainerOffTitle: "Caps Lock off",
        ExplainerOffDesc: "Normal sleep behavior resumes.",
        PreferencesHeading: "Preferences",
        Done: "Done",
        GetStarted: "Get started",
        TooltipOn: "Caps Lock ON: processes stay awake",
        TooltipOff: "Caps Lock OFF: normal sleep",
        TooltipError: "Capsomnia could not update the sleep setting — retrying");

    public static readonly AppStrings Japanese = new(
        ShowTrayIcon: "通知領域に表示",
        ShowTrayIconDesc: "通知領域にLEDステータスを表示します。",
        Language: "言語",
        OpenAtLogin: "ログイン時に起動",
        OpenAtLoginDesc: "サインイン後にCapsomniaを自動で起動します。",
        DisplaySleepOnLidClose: "蓋を閉じたら画面をオフ",
        DisplaySleepOnLidCloseDesc: "Caps Lock ON中は作業を走らせたまま、蓋を閉じたら画面だけ暗くします。",
        OpenCapsomnia: "Capsomniaを開く",
        Quit: "終了",
        SettingsTitle: "設定",
        InitialSettingsNote: "蓋クローズ用ヘルパーのインストール時に一度だけWindowsの管理者承認が求められます。設定はあとからいつでも変更できます。",
        WelcomeTitle: "Capsomniaへようこそ",
        ExplainerOnTitle: "Caps Lock ON",
        ExplainerOnDesc: "システムスリープを無効化。蓋を閉じても作業が走り続けます。",
        ExplainerOffTitle: "Caps Lock OFF",
        ExplainerOffDesc: "通常のスリープ動作に戻ります。",
        PreferencesHeading: "環境設定",
        Done: "完了",
        GetStarted: "はじめる",
        TooltipOn: "Caps Lock ON: スリープ抑止中",
        TooltipOff: "Caps Lock OFF: 通常のスリープ動作",
        TooltipError: "スリープ設定を更新できませんでした — 再試行中");

    public static readonly AppStrings Korean = new(
        ShowTrayIcon: "트레이 아이콘 표시",
        ShowTrayIconDesc: "알림 영역에 LED 상태 점을 표시합니다.",
        Language: "언어",
        OpenAtLogin: "로그인 시 실행",
        OpenAtLoginDesc: "로그인 후 Capsomnia를 자동으로 실행합니다.",
        DisplaySleepOnLidClose: "덮개를 닫으면 화면 끄기",
        DisplaySleepOnLidCloseDesc: "Caps Lock이 켜져 있는 동안 작업은 계속 실행하고, 덮개를 닫으면 화면만 끕니다.",
        OpenCapsomnia: "Capsomnia 열기",
        Quit: "종료",
        SettingsTitle: "설정",
        InitialSettingsNote: "덮개 닫힘 helper 작업을 설치할 때 한 번만 Windows 관리자 승인이 필요합니다. 설정은 언제든지 다시 변경할 수 있습니다.",
        WelcomeTitle: "Capsomnia에 오신 것을 환영합니다",
        ExplainerOnTitle: "Caps Lock 켬",
        ExplainerOnDesc: "시스템 절전을 비활성화합니다 — 덮개를 열든 닫든 작업이 계속 실행됩니다.",
        ExplainerOffTitle: "Caps Lock 끔",
        ExplainerOffDesc: "정상 절전 동작으로 돌아갑니다.",
        PreferencesHeading: "환경설정",
        Done: "완료",
        GetStarted: "시작하기",
        TooltipOn: "Caps Lock ON: 절전 방지 중",
        TooltipOff: "Caps Lock OFF: 정상 절전",
        TooltipError: "절전 설정을 갱신하지 못했습니다 — 재시도 중");
}
