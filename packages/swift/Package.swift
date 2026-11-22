// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TextHue",
    products: [.library(name: "TextHue", targets: ["TextHue"])],
    targets: [
        .target(name: "TextHue"),
        .testTarget(name: "TextHueTests", dependencies: ["TextHue"])
    ]
)
