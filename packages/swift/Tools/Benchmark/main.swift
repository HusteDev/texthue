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
