// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TextHue",
    platforms: [.macOS(.v10_15), .iOS(.v13), .tvOS(.v13), .watchOS(.v6)],
    products: [.library(name: "TextHue", targets: ["TextHue"])],
    dependencies: [.package(url: "https://github.com/apple/swift-crypto.git", exact: "3.0.0")],
    targets: [
        .executableTarget(name: "TextHueConformance", dependencies: ["TextHue"], path: "Tools/Conformance"),
        .executableTarget(name: "TextHueLabels", dependencies: ["TextHue"], path: "Examples/Labels"),
        .target(name: "TextHue", dependencies: [
            .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux, .windows]))
        ]),
        .testTarget(name: "TextHueTests", dependencies: ["TextHue"], resources: [.copy("Fixtures")])
    ]
)
