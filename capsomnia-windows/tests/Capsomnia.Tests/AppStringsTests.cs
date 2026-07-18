using System.Globalization;
using Capsomnia.Core;
using Xunit;

namespace Capsomnia.Tests;

public class AppStringsTests
{
    [Theory]
    [InlineData(AppLanguage.English)]
    [InlineData(AppLanguage.Japanese)]
    [InlineData(AppLanguage.Korean)]
    public void AllStringsAreNonEmpty(AppLanguage language)
    {
        var strings = AppStrings.For(language);

        foreach (var property in typeof(AppStrings).GetProperties())
        {
            if (property.PropertyType != typeof(string))
            {
                continue;
            }

            var value = (string?)property.GetValue(strings);
            Assert.False(string.IsNullOrWhiteSpace(value), $"{language}.{property.Name} is empty");
        }
    }

    [Theory]
    [InlineData("ja-JP", AppLanguage.Japanese)]
    [InlineData("ko-KR", AppLanguage.Korean)]
    [InlineData("en-US", AppLanguage.English)]
    [InlineData("de-DE", AppLanguage.English)]
    public void DefaultLanguageFollowsCulture(string cultureName, AppLanguage expected)
    {
        var culture = CultureInfo.GetCultureInfo(cultureName);

        Assert.Equal(expected, AppLanguageExtensions.DefaultLanguage(culture));
    }

    [Fact]
    public void LanguageCodesRoundTrip()
    {
        foreach (var language in Enum.GetValues<AppLanguage>())
        {
            Assert.Equal(language, AppLanguageExtensions.FromCode(language.Code()));
        }
    }

    [Fact]
    public void TooltipsFitNotifyIconLimit()
    {
        // NotifyIcon.Text is limited to 63 characters on Windows.
        foreach (var language in Enum.GetValues<AppLanguage>())
        {
            var strings = AppStrings.For(language);
            Assert.True(strings.TooltipOn.Length <= 63);
            Assert.True(strings.TooltipOff.Length <= 63);
            Assert.True(strings.TooltipError.Length <= 63);
        }
    }
}
