import TextHue

let arguments = Array(CommandLine.arguments.dropFirst())
let labels = arguments.isEmpty ? ["apple", "pear", "apple"] : arguments
let renderer = try Renderer(namespace: "project", seed: 42)
for label in labels {
    print(label, try renderer.hex(label), try renderer.color(label, dark: true, role: "onFill").hex)
}
