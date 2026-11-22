import XCTest
import TextHue

final class OptionsTests: XCTestCase {
    func testPublicConfigurationIsCapturedAtConstruction() throws {
        var options = RenderOptions()
        options.backgrounds = ["light": "#AbCdEf"]
        options.contrastTargets = ["text": 7]
        options.profiles = ["dark": ["fill": RoleProfile(chromaCap: 0)]]
        let renderer = try Renderer(options: options)
        options.backgrounds = [:]
        let result = try renderer.resolve("configured")
        XCTAssertEqual(result.light["background"]?.hex, "#abcdef")
        XCTAssertEqual(result.dark["fill"]?.oklch.c, 0)
    }

    func testRejectsInvalidConfigurationBeforeRendering() {
        let invalid: [(inout RenderOptions) -> Void] = [
            { $0.contrastTarget = .nan }, { $0.contrastTargets = ["text": 22] },
            { $0.contrastTargets = ["missing": 4] }, { $0.backgrounds = ["light": "#+12345"] },
            { $0.backgrounds = ["unknown": "#ffffff"] }, { $0.profiles = ["day": [:]] },
            { $0.profiles = ["light": ["border": RoleProfile()]] },
            { $0.profiles = ["dark": ["text": RoleProfile(lightness: [0.8, 0.2])]] },
            { $0.profiles = ["dark": ["text": RoleProfile(chromaScale: [])]] },
            { $0.profiles = ["dark": ["text": RoleProfile(chromaCap: .infinity)]] }
        ]
        for configure in invalid {
            var options = RenderOptions()
            configure(&options)
            XCTAssertThrowsError(try Renderer(options: options)) {
                XCTAssertEqual($0 as? RenderError, .invalidOptions)
            }
        }
    }
}
