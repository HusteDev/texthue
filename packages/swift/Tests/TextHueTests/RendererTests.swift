import XCTest
@testable import TextHue

final class RendererTests: XCTestCase {
    func testFrozenTonesFromIdentityFractions() throws {
        struct Theme: Decodable {
            let background, subtle, muted, fill, onFill, fillHover, fillActive, border, text, strong: Color
        }
        struct Palette: Decodable { let hue: Double; let light, dark: Theme }
        struct Vector: Decodable { let options: RenderOptions; let fractions: [Double]; let expected: Palette }
        struct Corpus: Decodable { let vectors: [Vector] }
        let corpus = try fixture("vectors.json", as: Corpus.self)
        XCTAssertEqual(corpus.vectors.count, 32)
        for vector in corpus.vectors {
            let f = vector.fractions
            let actual = try Renderer(options: vector.options).render(hueFraction: f[0], lightness: f[1], chroma: f[2])
            XCTAssertEqual(actual.hue, vector.expected.hue, accuracy: 1e-12)
            for (colors, expected) in [(actual.light, vector.expected.light), (actual.dark, vector.expected.dark)] {
                let roles = ["background":expected.background, "subtle":expected.subtle, "muted":expected.muted,
                             "fill":expected.fill, "onFill":expected.onFill, "fillHover":expected.fillHover,
                             "fillActive":expected.fillActive, "border":expected.border, "text":expected.text,
                             "strong":expected.strong]
                XCTAssertEqual(colors.mapValues(\.rgb), roles.mapValues(\.rgb))
            }
        }
    }
}
