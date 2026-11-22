using System.Net;
using NuGet.Packaging;

// Keep stdout machine-readable for the workflow. A failed lookup must abort publication.
if (args.Length is < 2 or > 3)
    throw new ArgumentException("Expected VERSION STAGED_NUPKG [LOCAL_REGISTRY_COPY]");

var version = args[0];
if (!Version.TryParse(version, out var parsed) || parsed.ToString(3) != version)
    throw new ArgumentException("Expected a three-component release version");

using var staged = new PackageArchiveReader(args[1]);
var identity = staged.GetIdentity();
if (identity.Id != "TextHue" || identity.Version.ToNormalizedString() != version)
    throw new InvalidDataException("Staged NuGet identity does not match the release");

byte[] bytes;
if (args.Length == 3)
    bytes = File.ReadAllBytes(args[2]);
else
{
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    var url = $"https://api.nuget.org/v3-flatcontainer/texthue/{version}/texthue.{version}.nupkg";
    using var response = await client.GetAsync(url);
    if (response.StatusCode == HttpStatusCode.NotFound)
    {
        Console.WriteLine("absent");
        return 0;
    }
    response.EnsureSuccessStatusCode();
    bytes = await response.Content.ReadAsByteArrayAsync();
}
using var published = new PackageArchiveReader(new MemoryStream(bytes));
var matching = staged.GetContentHash(CancellationToken.None) == published.GetContentHash(CancellationToken.None);
Console.WriteLine(matching ? "matching" : "conflicting");
return matching ? 0 : 1;
