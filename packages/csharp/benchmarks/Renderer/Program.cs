using System.Diagnostics;
using System.Text.Json;
using TextHue;

foreach (var (scenario, target, gray) in new[] {
    ("default", 4.5, false), ("aaa", 7, false), ("maximum", 21, false),
    ("gray", 4.5, true), ("impossible", 21, true), ("apca", 75, false), ("p3", 4.5, false)
})
{
    byte channel = gray ? (byte)119 : (byte)255;
    var renderer = new Renderer(contrastModel: scenario == "apca" ? ContrastModel.Apca : ContrastModel.Wcag2,
        gamut: scenario == "p3" ? Gamut.DisplayP3 : Gamut.SRgb,
        contrastTarget: target, lightBackground: new Rgb(channel, channel, channel));
#if TEXTHUE_COUNT_WORK
    RendererWork.Reset();
    for (int i = 0; i < 100; i++) renderer.Resolve($"item:{i}");
    int fitLimit = scenario switch {
        "default" or "p3" => 1600, "aaa" => 5732, "maximum" => 13325,
        "gray" => 3068, "impossible" => 12252, "apca" => 11133,
        _ => throw new ArgumentOutOfRangeException(nameof(scenario))
    };
    if (RendererWork.Fits < 1600 || RendererWork.Fits > fitLimit ||
        RendererWork.Cusps != 1600 || RendererWork.Hashes != 100)
        throw new InvalidOperationException($"{scenario}: {RendererWork.Fits} fits, {RendererWork.Cusps} cusps, {RendererWork.Hashes} hashes");
    Console.WriteLine(JsonSerializer.Serialize(new {scenario, fits = RendererWork.Fits,
        cusps = RendererWork.Cusps, hashes = RendererWork.Hashes}));
#else
    var samples = new double[100];
    for (int i = -20; i < samples.Length; i++)
    {
        string label = $"item:{i}";
        long start = Stopwatch.GetTimestamp();
        var palette = renderer.Resolve(label);
        double microseconds = Stopwatch.GetElapsedTime(start).TotalMicroseconds;
        if (scenario == "p3" && (palette.Light["fill"].P3 is null || palette.Dark["fill"].P3 is null))
            throw new InvalidOperationException("Missing native Display-P3 fill");
        GC.KeepAlive(palette);
        if (i >= 0) samples[i] = microseconds;
    }
    Array.Sort(samples);
    Console.WriteLine(JsonSerializer.Serialize(new {
        scenario, medianUs = (samples[49] + samples[50]) / 2, p95Us = samples[94]
    }));
#endif
}

#if !TEXTHUE_COUNT_WORK
{
    var renderer = new Renderer();
    var labels = Enumerable.Range(0, 40).Select(i => $"item:{i}").ToArray();
    var samples = new double[20];
    for (int i = -5; i < samples.Length; i++)
    {
        long start = Stopwatch.GetTimestamp();
        var assignment = renderer.Assign(labels);
        double elapsed = Stopwatch.GetElapsedTime(start).TotalMicroseconds;
        if (assignment.Colors.Count != labels.Length) throw new InvalidOperationException("Incomplete assignment");
        if (i >= 0) samples[i] = elapsed;
    }
    Array.Sort(samples);
    Console.WriteLine(JsonSerializer.Serialize(new { scenario = "assign40", medianUs = (samples[9] + samples[10]) / 2, p95Us = samples[18] }));
}
#endif
