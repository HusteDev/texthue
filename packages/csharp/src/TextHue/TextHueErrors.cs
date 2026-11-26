namespace TextHue;

/// <summary>Stable codes for exceptions raised by TextHue public APIs.</summary>
public static class TextHueErrors
{
    public static string? GetCode(Exception error) => error.Data["TextHue.Code"] as string;

    internal static T WithCode<T>(T error, string code = "INVALID_OPTIONS") where T : Exception
    {
        error.Data["TextHue.Code"] = code;
        return error;
    }
}
