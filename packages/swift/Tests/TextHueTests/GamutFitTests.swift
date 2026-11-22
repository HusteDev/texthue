import XCTest
@testable import TextHue

final class GamutFitTests: XCTestCase {
    func testP3Fit() throws {
        struct Row: Decodable {
            let l, c, h: Double
            let rgb: [UInt8]
        }
        let rows = try fixture("p3-fit-v1.json", as: [Row].self)
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            let fit = Gamut.displayP3.fit(lightness: row.l, chroma: row.c, hue: row.h)
            XCTAssertEqual(fit.bytes, row.rgb)
        }
    }

    func testTraceRenditions() throws {
        struct Coordinates: Decodable { let l, c, h: Double }
        struct Trace: Decodable { let repaired, fitted: Coordinates }
        struct Channels: Decodable { let r, g, b: Double }
        struct Color: Decodable { let trace: Trace?; let rgb: Channels; let p3: Channels? }
        struct Theme: Decodable { let color: Color }
        struct Vector: Decodable { let themes: [String: Theme] }
        struct Corpus: Decodable { let vectors: [Vector] }
        let corpus = try fixture("renderer-v1.json", as: Corpus.self)
        var checked = 0
        for vector in corpus.vectors {
            for theme in vector.themes.values {
                let color = theme.color
                guard let trace = color.trace else { continue }
                let gamut: Gamut = color.p3 == nil ? .sRGB : .displayP3
                let p = trace.repaired
                let fit = gamut.fit(lightness: p.l, chroma: p.c, hue: p.h)
                let channels = color.p3 ?? color.rgb
                let scale: Double = color.p3 == nil ? 1 : 255
                XCTAssertEqual(fit.bytes, [channels.r, channels.g, channels.b].map { UInt8(($0 * scale).rounded()) })
                XCTAssertEqual(fit.chroma, trace.fitted.c, accuracy: 1e-12)
                checked += 1
            }
        }
        XCTAssertEqual(checked, 4)
    }
}
