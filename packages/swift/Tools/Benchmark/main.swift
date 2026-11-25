import Dispatch
import TextHue

for (scenario, target, light) in [
    ("default", 4.5, "#ffffff"), ("aaa", 7, "#ffffff"), ("maximum", 21, "#ffffff"),
    ("gray", 4.5, "#777777"), ("impossible", 21, "#777777"), ("apca", 75, "#ffffff"),
    ("p3", 4.5, "#ffffff")
] {
    var options = RenderOptions()
    options.contrastModel = scenario == "apca" ? .apca : .wcag2
    options.gamut = scenario == "p3" ? .displayP3 : .sRGB
    options.contrastTarget = target
    options.backgrounds = ["light": light]
    let renderer = try Renderer(options: options)
    #if TEXTHUE_COUNT_WORK
    let counts = RendererWork.current
    counts.fits = 0
    counts.cusps = 0
    counts.hashes = 0
    for i in 0..<100 { _ = try renderer.resolve("item:\(i)") }
    let fitLimits = ["default": 1600, "aaa": 5732, "maximum": 13325, "gray": 3068,
                     "impossible": 12252, "apca": 11133, "p3": 1600]
    guard let limit = fitLimits[scenario], (1600...limit).contains(counts.fits),
          counts.cusps == 1600, counts.hashes == 100 else {
        fatalError("\(scenario): \(counts.fits) fits, \(counts.cusps) cusps, \(counts.hashes) hashes")
    }
    print(#"{"scenario":"\#(scenario)","fits":\#(counts.fits),"cusps":\#(counts.cusps),"hashes":\#(counts.hashes)}"#)
    #else
    var samples: [Double] = []
    for i in -20..<100 {
        let label = "item:\(i)"
        let start = DispatchTime.now().uptimeNanoseconds
        let palette = try renderer.resolve(label)
        let elapsed = DispatchTime.now().uptimeNanoseconds - start
        precondition(palette.light["fill"] != nil && palette.dark["fill"] != nil)
        if scenario == "p3" { precondition(palette.light["fill"]?.p3 != nil && palette.dark["fill"]?.p3 != nil) }
        if i >= 0 { samples.append(Double(elapsed) / 1000) }
    }
    samples.sort()
    let median = (samples[49] + samples[50]) / 2
    print(#"{"scenario":"\#(scenario)","medianUs":\#(median),"p95Us":\#(samples[94])}"#)
    #endif
}

#if !TEXTHUE_COUNT_WORK
let labels = (0..<40).map { "item:\($0)" }
let renderer = try Renderer()
var samples: [Double] = []
for i in -5..<20 {
    let start = DispatchTime.now().uptimeNanoseconds
    let assignment = try renderer.assign(labels)
    let elapsed = DispatchTime.now().uptimeNanoseconds - start
    precondition(assignment.colors.count == labels.count)
    if i >= 0 { samples.append(Double(elapsed) / 1000) }
}
samples.sort()
print(#"{"scenario":"assign40","medianUs":\#((samples[9] + samples[10]) / 2),"p95Us":\#(samples[18])}"#)
#endif
