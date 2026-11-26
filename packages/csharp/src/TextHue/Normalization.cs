using System.Text;
using System.Text.RegularExpressions;

namespace TextHue;

public enum UnicodeForm { None, NFC, NFKC }
public enum Whitespace { None, Trim, Collapse }

public sealed record Normalization(UnicodeForm Unicode = UnicodeForm.None, bool Lowercase = false, Whitespace Whitespace = Whitespace.None)
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    // In invariant mode .NET accepts Normalize calls but skips composition.
    private static readonly bool HasUnicodeNormalization =
        "e\u0301".Normalize(NormalizationForm.FormC) == "\u00e9";

    public string Apply(string input) => Apply(input, "INVALID_TEXT");

    internal string Apply(string input, string code)
    {
        if (input is null) throw TextHueErrors.WithCode(new ArgumentNullException(nameof(input)), code);
        try { StrictUtf8.GetByteCount(input); }
        catch (EncoderFallbackException error) { TextHueErrors.WithCode(error, code); throw; }
        if (Unicode != UnicodeForm.None && !HasUnicodeNormalization)
            throw TextHueErrors.WithCode(new PlatformNotSupportedException("TextHue NFC and NFKC require .NET globalization data. Disable invariant globalization and install ICU where required."));
        string value = Unicode switch {
            UnicodeForm.None => input,
            UnicodeForm.NFC => input.Normalize(NormalizationForm.FormC),
            UnicodeForm.NFKC => input.Normalize(NormalizationForm.FormKC),
            _ => throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(Unicode)))
        };
        if (Lowercase) value = Lower(value);
        return Whitespace switch {
            Whitespace.None => value,
            Whitespace.Trim => value.Trim(),
            Whitespace.Collapse => Regex.Replace(value.Trim(), @"\s+", " "),
            _ => throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(Whitespace)))
        };
    }

    private static bool Contains(int[] boundaries, Rune rune)
    {
        int index = Array.BinarySearch(boundaries, rune.Value);
        return index >= 0 ? index % 2 == 0 : (~index) % 2 == 1;
    }

    private static string Lower(string value)
    {
        if (!value.Contains('Σ')) return value.Replace("İ", "i\u0307").ToLowerInvariant();
        var runes = value.EnumerateRunes().ToArray();
        var result = new StringBuilder(value.Length);
        bool precededByCased = false;
        for (int i = 0; i < runes.Length; i++)
        {
            var rune = runes[i];
            if (rune.Value == 'Σ' && precededByCased)
            {
                int j = i + 1;
                while (j < runes.Length && Contains(CaseProperties.Ignorable, runes[j])) j++;
                result.Append(j < runes.Length && Contains(CaseProperties.Cased, runes[j]) ? 'σ' : 'ς');
            }
            else if (rune.Value == 'İ') result.Append("i\u0307");
            else result.Append(Rune.ToLowerInvariant(rune).ToString());
            if (!Contains(CaseProperties.Ignorable, rune)) precededByCased = Contains(CaseProperties.Cased, rune);
        }
        return result.ToString();
    }
}
