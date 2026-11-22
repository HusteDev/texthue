import TextHue

let arguments = Array(CommandLine.arguments.dropFirst())
let labels = arguments.isEmpty ? ["apple", "pear", "apple"] : arguments
let renderer = try Renderer(namespace: "project", seed: 42)
for (label, palette) in zip(labels, try renderer.batch(labels)) {
    guard let fill = palette.light["fill"], let foreground = palette.dark["onFill"] else {
        fatalError("Missing a required role")
    }
    print(label, fill.hex, foreground.hex)
}
