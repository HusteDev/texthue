import XCTest
@testable import TextHue

final class ColorTests: XCTestCase {
    func testCSSFormats() {
        let rgb = RGB(r: 255, g: 0, b: 0)
        let red = Color(rgb: rgb)
        XCTAssertEqual(red.toCSS(), "#ff0000")
        XCTAssertEqual(red.toCSS(.rgb), "rgb(255 0 0)")
        XCTAssertEqual(red.toCSS(.hsl), "hsl(0 100% 50%)")
        XCTAssertEqual(red.toCSS(.oklch), "oklch(0.627955 0.257683 29.23388)")
        XCTAssertEqual(red.toCSS(.displayP3), "color(display-p3 0.917488 0.200287 0.138561)")
        XCTAssertEqual(Color(bytes: rgb, gamut: .displayP3).toCSS(.displayP3), "color(display-p3 1 0 0)")
    }

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
