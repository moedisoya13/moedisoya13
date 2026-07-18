using System.Drawing.Drawing2D;

namespace Capsomnia.App;

/// <summary>
/// Brand palette from the original app (docs/styles.css :root) and the LED dot
/// icons drawn at runtime, mirroring the original DotImage menu bar dots.
/// </summary>
internal static class Brand
{
    public static readonly Color Bg = ColorTranslator.FromHtml("#000000");
    public static readonly Color Surface = ColorTranslator.FromHtml("#0A0A0A");
    public static readonly Color Border = ColorTranslator.FromHtml("#1F1F1F");
    public static readonly Color Text = ColorTranslator.FromHtml("#F2F4EC");
    public static readonly Color TextDim = ColorTranslator.FromHtml("#A7AD9C");
    public static readonly Color Led = ColorTranslator.FromHtml("#B8FF1F");
    public static readonly Color OffDot = ColorTranslator.FromHtml("#8F8F8F");
    public static readonly Color ErrorDot = ColorTranslator.FromHtml("#E5484D");
}

internal sealed class TrayIcons : IDisposable
{
    public Icon On { get; } = MakeDot(Brand.Led);
    public Icon Off { get; } = MakeDot(Brand.OffDot);
    public Icon Error { get; } = MakeDot(Brand.ErrorDot);

    private static Icon MakeDot(Color color)
    {
        const int size = 16;
        const int inset = 3;
        using var bitmap = new Bitmap(size, size);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.Clear(Color.Transparent);
            using var brush = new SolidBrush(color);
            graphics.FillEllipse(brush, inset, inset, size - 2 * inset, size - 2 * inset);
        }

        var handle = bitmap.GetHicon();
        try
        {
            // Clone so the icon owns its data and the temporary handle can go.
            return (Icon)Icon.FromHandle(handle).Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);

    public void Dispose()
    {
        On.Dispose();
        Off.Dispose();
        Error.Dispose();
    }
}
