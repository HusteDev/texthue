import XCTest
@testable import TextHue

final class RendererTests: XCTestCase {
    func testFrozenTonesFromText() throws {
        struct Theme: Decodable {
            let background, subtle, muted, fill, onFill, fillHover, fillActive, border, text, strong: Color
        }
        struct Palette: Decodable { let version, source: String; let hueFraction, hue: Double; let light, dark: Theme }
        struct Encoding: Decodable { let sha256: String }
        struct Vector: Decodable { let text: String; let encoding: Encoding; let options: RenderOptions; let fractions: [Double]; let expected: Palette }
        struct Corpus: Decodable { let vectors: [Vector] }
        let corpus = try fixture("vectors.json", as: Corpus.self)
        XCTAssertEqual(corpus.vectors.count, 32)
        for vector in corpus.vectors {
            let digest = try identityDigest(vector.text, namespace: vector.options.namespace ?? "", seed: vector.options.seed ?? 0)
            XCTAssertEqual(digest.map { String(format: "%02x", $0) }.joined(), vector.encoding.sha256)
            XCTAssertEqual(identityFractions(digest), vector.fractions)
            let actual = try Renderer(options: vector.options).resolve(vector.text)
            XCTAssertEqual(actual.version, vector.expected.version)
            XCTAssertEqual(actual.source, vector.expected.source)
            XCTAssertEqual(actual.hueFraction, vector.expected.hueFraction)
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
