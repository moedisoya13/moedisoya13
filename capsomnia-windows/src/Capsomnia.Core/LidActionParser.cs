using System.Text.RegularExpressions;

namespace Capsomnia.Core;

/// <summary>
/// Current lid-close action indexes read from <c>powercfg /query</c>.
/// Index meaning on Windows: 0 = do nothing, 1 = sleep, 2 = hibernate, 3 = shut down.
/// </summary>
public readonly record struct LidActionState(int Ac, int Dc)
{
    /// <summary>Lid-close sleep is disabled when both AC and DC actions are "do nothing".</summary>
    public bool IsLidSleepDisabled => Ac == 0 && Dc == 0;
}

/// <summary>
/// Parses <c>powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION</c> output.
/// Windows port of the original SleepStateReader.parse (which read <c>pmset -g</c>).
/// </summary>
public static partial class LidActionParser
{
    // powercfg localizes every label ("Current AC Power Setting Index" /
    // "現在の AC 電源設定のインデックス" / "현재 AC 전원 설정 인덱스"), so the parser keys on
    // the locale-stable parts only: the standalone AC/DC token plus the 0x-prefixed
    // hex index on the same line. GUID lines never contain a standalone "AC"/"DC"
    // token followed by a 0x value, so they are naturally skipped.
    [GeneratedRegex(@"\bAC\b")]
    private static partial Regex AcToken();

    [GeneratedRegex(@"\bDC\b")]
    private static partial Regex DcToken();

    [GeneratedRegex(@"0x(?<hex>[0-9A-Fa-f]{1,8})\b")]
    private static partial Regex HexIndex();

    public static LidActionState? Parse(string output)
    {
        int? ac = null;
        int? dc = null;

        foreach (var line in output.Split('\n'))
        {
            var hexMatch = HexIndex().Match(line);
            if (!hexMatch.Success)
            {
                continue;
            }

            var value = Convert.ToInt32(hexMatch.Groups["hex"].Value, 16);
            if (ac is null && AcToken().IsMatch(line))
            {
                ac = value;
            }
            else if (dc is null && DcToken().IsMatch(line))
            {
                dc = value;
            }

            if (ac is not null && dc is not null)
            {
                break;
            }
        }

        if (ac is null || dc is null)
        {
            return null;
        }

        return new LidActionState(ac.Value, dc.Value);
    }
}
