using Capsomnia.Core;
using Xunit;

namespace Capsomnia.Tests;

public class LidActionParserTests
{
    private const string EnglishOutput = """
        Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
          Subgroup GUID: 4f971e89-eebd-4455-a8de-9e59040e7347  (Power buttons and lid)
            Power Setting GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (Lid close action)
              Possible Setting Index: 000
              Possible Setting Friendly Name: Do nothing
              Possible Setting Index: 001
              Possible Setting Friendly Name: Sleep
              Possible Setting Index: 002
              Possible Setting Friendly Name: Hibernate
              Possible Setting Index: 003
              Possible Setting Friendly Name: Shut down
            Current AC Power Setting Index: 0x00000001
            Current DC Power Setting Index: 0x00000002
        """;

    // powercfg localizes labels; only the AC/DC token and hex index are stable.
    private const string JapaneseOutput = """
        電源設定 GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (バランス)
          サブグループ GUID: 4f971e89-eebd-4455-a8de-9e59040e7347  (電源ボタンとカバー)
            電源設定 GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (カバーを閉じたときの操作)
            現在の AC 電源設定のインデックス: 0x00000000
            現在の DC 電源設定のインデックス: 0x00000000
        """;

    private const string KoreanOutput = """
        전원 구성표 GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (균형 조정)
          하위 그룹 GUID: 4f971e89-eebd-4455-a8de-9e59040e7347  (전원 단추 및 덮개)
            전원 설정 GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (덮개를 닫을 때 수행되는 작업)
            현재 AC 전원 설정 인덱스: 0x00000001
            현재 DC 전원 설정 인덱스: 0x00000001
        """;

    [Fact]
    public void ParsesEnglishOutput()
    {
        var state = LidActionParser.Parse(EnglishOutput);

        Assert.Equal(new LidActionState(1, 2), state);
        Assert.False(state!.Value.IsLidSleepDisabled);
    }

    [Fact]
    public void ParsesLocalizedJapaneseOutput()
    {
        var state = LidActionParser.Parse(JapaneseOutput);

        Assert.Equal(new LidActionState(0, 0), state);
        Assert.True(state!.Value.IsLidSleepDisabled);
    }

    [Fact]
    public void ParsesLocalizedKoreanOutput()
    {
        var state = LidActionParser.Parse(KoreanOutput);

        Assert.Equal(new LidActionState(1, 1), state);
        Assert.False(state!.Value.IsLidSleepDisabled);
    }

    [Fact]
    public void ReturnsNullForEmptyOutput()
    {
        Assert.Null(LidActionParser.Parse(""));
    }

    [Fact]
    public void ReturnsNullForGarbageOutput()
    {
        Assert.Null(LidActionParser.Parse("The system cannot find the file specified."));
    }

    [Fact]
    public void ReturnsNullWhenDcLineIsMissing()
    {
        Assert.Null(LidActionParser.Parse("Current AC Power Setting Index: 0x00000001"));
    }

    [Fact]
    public void IgnoresGuidLinesWithoutIndexValues()
    {
        // GUID hex fragments must not be misread as AC/DC indexes.
        var state = LidActionParser.Parse("""
            Subgroup GUID: 4f971e89-eebd-4455-a8de-9e59040e7347
            Current AC Power Setting Index: 0x00000000
            Current DC Power Setting Index: 0x00000000
            """);

        Assert.Equal(new LidActionState(0, 0), state);
    }

    [Fact]
    public void ParsesLargerHexValues()
    {
        var state = LidActionParser.Parse("""
            AC value: 0x00000003
            DC value: 0x0000000a
            """);

        Assert.Equal(new LidActionState(3, 10), state);
    }
}
