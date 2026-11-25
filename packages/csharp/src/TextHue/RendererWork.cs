#if TEXTHUE_COUNT_WORK
namespace TextHue;

public static class RendererWork
{
    public static int Fits { get; internal set; }
    public static int Cusps { get; internal set; }
    public static int Hashes { get; internal set; }
    public static void Reset() => Fits = Cusps = Hashes = 0;
}
#endif
