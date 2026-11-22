import Dispatch
import TextHue

for (scenario, target, light) in [
    ("default", 4.5, "#ffffff"), ("aaa", 7, "#ffffff"), ("maximum", 21, "#ffffff"),
    ("gray", 4.5, "#777777"), ("impossible", 21, "#777777")
] {
    var options = RenderOptions()
    options.contrastTarget = target
    options.backgrounds = ["light": light]
    let renderer = try Renderer(options: options)
    var samples: [Double] = []
    for i in -20..<100 {
        let label = "item:\(i)"
        let start = DispatchTime.now().uptimeNanoseconds
        let palette = try renderer.resolve(label)
        let elapsed = DispatchTime.now().uptimeNanoseconds - start
        precondition(palette.light["fill"] != nil && palette.dark["fill"] != nil)
        if i >= 0 { samples.append(Double(elapsed) / 1000) }
    }
    samples.sort()
    let median = (samples[49] + samples[50]) / 2
    print(#"{"scenario":"\#(scenario)","medianUs":\#(median),"p95Us":\#(samples[94])}"#)
}
