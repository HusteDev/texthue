import XCTest
@testable import TextHue

final class APCARendererTests: XCTestCase {
    func testFrozenTextRelationships() throws {
        struct Theme: Decodable {
            struct Pixel: Decodable { let hex: String }
            let color: Pixel
        }
        struct Vector: Decodable {
            let text, role: String
            let options: RenderOptions
            let themes: [String: Theme]
        }
        struct Corpus: Decodable { let vectors: [Vector] }
        let corpus = try fixture("renderer-v1.json", as: Corpus.self)
        let vectors = corpus.vectors.filter { $0.role == "text" && $0.options.contrastModel == .apca }
        XCTAssertEqual(vectors.compactMap { $0.options.contrastTarget }, [45,60,75,90])
        for vector in vectors {
            let colors = try Renderer(options: vector.options).resolve(vector.text)
            XCTAssertEqual(colors.light["text"]?.hex, vector.themes["light"]?.color.hex)
            XCTAssertEqual(colors.dark["text"]?.hex, vector.themes["dark"]?.color.hex)
        }
    }

    func testP3TextAgainstSuppliedBackground() throws {
        var options = RenderOptions()
        options.gamut = .displayP3
        options.contrastModel = .apca
        options.backgrounds = ["dark": "#176fd0"]
        let renderer = try Renderer(options: options)
        let palette = try renderer.resolve("sample")
        let text = try XCTUnwrap(palette.dark["text"])
        XCTAssertEqual(text.css, "color(display-p3 1 0.882353 0.823529)")
        XCTAssertEqual(try renderer.color("sample", dark: true, role: "text"), text)
        XCTAssertEqual(try renderer.hex("sample", dark: true, role: "text", strict: true), "#ffe0d0")
        let value = try XCTUnwrap(palette.darkContrast.relationships["text"]?.value)
        XCTAssertEqual(value, -63.99623265441859, accuracy: 1e-12)
    }

    func testIndependentZeroTargets() throws {
        for (primary, secondary, light, dark) in [
            (0.0, 90.0, "#003b44", "#a8f2ff"),
            (90.0, 0.0, "#0b515c", "#a1f1ff"),
            (0.0, 0.0, "#286771", "#53c4d7")
        ] {
            var options = RenderOptions()
            options.contrastModel = .apca
            options.contrastTargets = ["text": primary, "textOnSubtle": secondary]
            let colors = try Renderer(options: options).resolve("repair")
            XCTAssertEqual(colors.light["text"]?.hex, light)
            XCTAssertEqual(colors.dark["text"]?.hex, dark)
        }
    }
}
