// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TextHue",
    products: [.library(name: "TextHue", targets: ["TextHue"])],
    dependencies: [.package(url: "https://github.com/apple/swift-crypto.git", exact: "3.0.0")],
    targets: [
        .target(name: "TextHue", dependencies: [
            .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux, .windows]))
        ]),
        .testTarget(name: "TextHueTests", dependencies: ["TextHue"])
    ]
)
