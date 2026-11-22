import XCTest
@testable import TextHue

final class ColorTests: XCTestCase {
    func testFrozenRoleFormats() throws {
        struct Theme: Decodable {
            let background, subtle, muted, fill, onFill, fillHover, fillActive, border, text, strong: Color
            var roles: [Color] { [background, subtle, muted, fill, onFill, fillHover, fillActive, border, text, strong] }
        }
        struct Palette: Decodable { let light, dark: Theme }
        struct Vector: Decodable { let expected: Palette }
        struct Corpus: Decodable { let vectors: [Vector] }
        let corpus = try fixture("vectors.json", as: Corpus.self)
        var count = 0
        for vector in corpus.vectors {
            for expected in vector.expected.light.roles + vector.expected.dark.roles {
                let actual = Color(rgb: expected.rgb)
                XCTAssertEqual(actual.hex, expected.hex)
                XCTAssertEqual(actual.rgb, expected.rgb)
                XCTAssertEqual(actual.hsl.h, expected.hsl.h, accuracy: 1.000001e-6)
                XCTAssertEqual(actual.hsl.s, expected.hsl.s, accuracy: 1.000001e-6)
                XCTAssertEqual(actual.hsl.l, expected.hsl.l, accuracy: 1.000001e-6)
                XCTAssertEqual(actual.oklch.l, expected.oklch.l, accuracy: 1.000001e-6)
                XCTAssertEqual(actual.oklch.c, expected.oklch.c, accuracy: 1.000001e-6)
                XCTAssertEqual(actual.oklch.h, expected.oklch.h, accuracy: 1.000001e-6)
                count += 1
            }
        }
        XCTAssertEqual(count, 640)
    }
}
