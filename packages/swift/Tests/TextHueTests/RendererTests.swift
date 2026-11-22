import XCTest
@testable import TextHue

final class RendererTests: XCTestCase {
    func testEncodedContrastReports() throws {
        struct Vector: Decodable {
            let text: String
            let options: RenderOptions
            let expected: [String: Theme]
            struct Theme: Decodable { let contrast: ContrastReportFixture }
            enum Keys: String, CodingKey { case text, options, expected, light, dark }
            init(from decoder: Decoder) throws {
                let fields = try decoder.container(keyedBy: Keys.self)
                text = try fields.decode(String.self, forKey: .text)
                options = try fields.decode(RenderOptions.self, forKey: .options)
                let palette = try fields.nestedContainer(keyedBy: Keys.self, forKey: .expected)
                expected = try ["light": palette.decode(Theme.self, forKey: .light),
                                "dark": palette.decode(Theme.self, forKey: .dark)]
            }
        }
        struct ContrastReportFixture: Decodable {
            let target: Double
            let fill, fillHover, fillActive, border, text, textOnSubtle, strong: ContrastRelationship
        }
        struct Corpus: Decodable { let vectors: [Vector] }
        let corpus = try fixture("vectors.json", as: Corpus.self)
        for row in corpus.vectors {
            let result = try Renderer(options: row.options).resolve(row.text)
            struct Encoded: Decodable { let light, dark: Vector.Theme }
            let encoded = try JSONDecoder().decode(Encoded.self, from: JSONEncoder().encode(result))
            for (name, theme) in [("light", encoded.light), ("dark", encoded.dark)] {
                let a = theme.contrast, b = try XCTUnwrap(row.expected[name]).contrast
                XCTAssertEqual(a.target, b.target)
                for key in [\ContrastReportFixture.fill, \.fillHover, \.fillActive, \.border, \.text, \.textOnSubtle, \.strong] {
                    let x = a[keyPath: key], y = b[keyPath: key]
                    XCTAssertEqual(x.ratio, y.ratio, accuracy: 1e-12)
                    XCTAssertEqual(x.meetsTarget, y.meetsTarget)
                    XCTAssertEqual(x.lightnessAdjusted, y.lightnessAdjusted)
                    XCTAssertEqual(x.chromaCapped, y.chromaCapped)
                    XCTAssertEqual(x.chromaReduced, y.chromaReduced)
                    XCTAssertEqual(x.fallback, y.fallback)
                }
            }
        }
    }
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
