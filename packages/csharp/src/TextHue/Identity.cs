using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace TextHue;

internal static class Identity
{
    private static readonly UTF8Encoding Utf8 = new(false, true);

    internal static byte[] Digest(string text, string scope, uint seed)
    {
        var scopeBytes = Utf8.GetBytes(scope);
        Span<byte> header = stackalloc byte[8];
        BinaryPrimitives.WriteUInt32BigEndian(header, seed);
        BinaryPrimitives.WriteUInt32BigEndian(header[4..], (uint)scopeBytes.Length);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData("text-to-color-v1\0"u8);
        hash.AppendData(header);
        hash.AppendData(scopeBytes);
        hash.AppendData(Utf8.GetBytes(text));
#if TEXTHUE_COUNT_WORK
        RendererWork.Hashes++;
#endif
        return hash.GetHashAndReset();
    }

    internal static (double Hue, double Lightness, double Chroma) Fractions(ReadOnlySpan<byte> digest)
    {
        const double divisor = 4294967296.0;
        return (BinaryPrimitives.ReadUInt32BigEndian(digest) / divisor,
                BinaryPrimitives.ReadUInt32BigEndian(digest[4..]) / divisor,
                BinaryPrimitives.ReadUInt32BigEndian(digest[8..]) / divisor);
    }
}
