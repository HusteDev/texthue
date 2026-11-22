import XCTest
import TextHue

final class ForegroundTests: XCTestCase {
    func testOrderedSelectionAndSurfaceRepair() throws {
        for model in [ContrastModel.wcag2, .apca] {
            for policy in [ForegroundPolicy.best, .firstPassing] {
                for high in [false, true] {
                    var options = RenderOptions()
                    options.contrastModel = model
                    options.foregroundPolicy = policy
                    options.foregrounds = ["#556677", "#000000", "#ffffff"]
                    options.contrastTarget = model == .apca ? (high ? 106 : 0) : (high ? 21 : 1)
                    let palette = try Renderer(options: options).resolve("foreground")
                    let actual = [palette.light, palette.dark].flatMap { theme in
                        ["fill", "onFill", "fillHover"].compactMap { theme[$0]?.hex }
                    }
                    let expected: [String]
                    if high {
                        let darkFill = model == .apca ? "#002206" : "#000000"
                        expected = ["#ffffff", "#000000", "#ffffff", darkFill, "#ffffff", darkFill]
                    } else {
                        expected = ["#72da7e", policy == .best ? "#000000" : "#556677", "#6ad277",
                                    "#2e7137", policy == .best ? "#ffffff" : "#556677", "#32793c"]
                    }
                    XCTAssertEqual(actual, expected)
                }
            }
        }
    }

    func testInvalidCandidates() {
        for candidates in [[], ["#abc"], ["#123456", "#zzzzzz"]] {
            var options = RenderOptions()
            options.foregrounds = candidates
            XCTAssertThrowsError(try Renderer(options: options))
        }
    }
}
