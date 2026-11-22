import XCTest
import TextHue

final class BatchTests: XCTestCase {
    func testExactUTF8KeysPreserveOrderAndDuplicates() throws {
        let renderer = try Renderer(namespace: "scope", seed: 42)
        let labels = ["é", "", "e\u{301}", "é", "\u{0}", "e\u{301}"]
        var palettes = try renderer.batch(labels)
        XCTAssertEqual(palettes, try labels.map(renderer.resolve))
        XCTAssertNotEqual(palettes[0].hue, palettes[2].hue)
        palettes.removeFirst()
        XCTAssertEqual(palettes[2], try renderer.resolve(labels[0]))
        XCTAssertEqual(try renderer.batch([]), [])
    }

    func testNormalizedAliasesMatchSingleResolution() throws {
        let renderer = try Renderer(normalize: Normalization(unicode: .NFC, casing: .lower, whitespace: .trim))
        let labels = [" É ", "other", "E\u{301}", "é"]
        let palettes = try renderer.batch(labels)
        XCTAssertEqual(palettes, try labels.map(renderer.resolve))
        XCTAssertEqual(palettes[0], palettes[2])
        XCTAssertEqual(palettes[2], palettes[3])
    }
}
