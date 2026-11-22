import XCTest
import TextHue

final class OverrideTests: XCTestCase {
    func testNormalizedFixedTonesMatchReference() throws {
        var options = RenderOptions()
        options.normalize = Normalization(casing: .lower)
        options.overrides = ["TEAM": BrandColors(light: "#ab1234", dark: "#777777")]
        let renderer = try Renderer(options: options)
        let result = try renderer.resolve("Team")
        XCTAssertEqual(result.source, "override")
        XCTAssertEqual(result.hue, 17.6767578125)
        XCTAssertEqual(result.hueFraction, 0.01669445425766595)
        XCTAssertEqual(result.light["fill"]?.hex, "#ab1234")
        XCTAssertEqual(result.light["fillHover"]?.hex, "#8e313b")
        XCTAssertEqual(result.dark["fill"]?.hex, "#777777")
        XCTAssertEqual(result.dark["fillActive"]?.hex, "#868686")
        XCTAssertEqual(try renderer.resolve("other").source, "hash")
        options.overrides?["team"] = BrandColors(light: "#123456", dark: "#654321")
        XCTAssertThrowsError(try Renderer(options: options))
    }

    func testStringOverridePreservesFillAtUnattainableTarget() throws {
        let json = ##"{"contrastModel":"apca","contrastTarget":106,"foregrounds":["#777777"],"overrides":{"fixed":"#777777"}}"##
        let options = try JSONDecoder().decode(RenderOptions.self, from: Data(json.utf8))
        let result = try Renderer(options: options).resolve("fixed")
        XCTAssertEqual(result.light["fill"]?.hex, "#777777")
        XCTAssertEqual(result.dark["fill"]?.hex, "#777777")
    }
}
