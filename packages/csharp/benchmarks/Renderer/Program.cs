using System.Diagnostics;
using System.Text.Json;
using TextHue;

foreach (var (scenario, target, gray) in new[] {
    ("default", 4.5, false), ("aaa", 7, false), ("maximum", 21, false),
    ("gray", 4.5, true), ("impossible", 21, true)
})
{
    byte channel = gray ? (byte)119 : (byte)255;
    var renderer = new Renderer(contrastTarget: target, lightBackground: new Rgb(channel, channel, channel));
    var samples = new double[100];
    for (int i = -20; i < samples.Length; i++)
    {
        string label = $"item:{i}";
        long start = Stopwatch.GetTimestamp();
        var palette = renderer.Resolve(label);
        double microseconds = Stopwatch.GetElapsedTime(start).TotalMicroseconds;
        GC.KeepAlive(palette);
        if (i >= 0) samples[i] = microseconds;
    }
    Array.Sort(samples);
    Console.WriteLine(JsonSerializer.Serialize(new {
        scenario, medianUs = (samples[49] + samples[50]) / 2, p95Us = samples[94]
    }));
}
