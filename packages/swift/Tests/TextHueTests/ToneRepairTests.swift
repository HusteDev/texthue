import XCTest
@testable import TextHue

final class ToneRepairTests: XCTestCase {
    func testSharedRepairs() throws {
        let data = try fixtureData("tone-repair-v1.tsv")
        let lines = String(decoding: data, as: UTF8.self).split(whereSeparator: \.isNewline)
        XCTAssertEqual(lines.count, 192)
        for line in lines {
            let fields = line.split(separator: "\t")
            let gamut: Gamut = fields[0] == "SRGB" ? .sRGB : .displayP3
            let model: ContrastModel = fields[1] == "APCA" ? .apca : .wcag2
            func number(_ i: Int) throws -> Double { try XCTUnwrap(Double(fields[i])) }
            func bytes(_ i: Int) throws -> [UInt8] {
                try fields[i].split(separator: ",").map { try XCTUnwrap(UInt8($0)) }
            }
            let background = try bytes(5)
            let tone = try gamut.repair(lightness: number(2), chroma: number(3), hue: number(4),
                                        target: number(6)) { rgb in
                abs(model.measure(text: rgb, background: background, gamut: gamut))
            }
            XCTAssertEqual(tone.color.bytes, try bytes(7))
            XCTAssertEqual(tone.color.lightness, try number(8))
            XCTAssertEqual(tone.color.chroma, try number(9), accuracy: 1e-12)
            XCTAssertEqual(tone.score, try number(10), accuracy: 1e-12)
            XCTAssertEqual(tone.fallback ?? "-", String(fields[11]))
        }
    }

    func testUnattainableTieSelectsBlack() {
        let result = Gamut.sRGB.repair(lightness: 0.5, chroma: 0, hue: 0, target: 1) { _ in 0 }
        XCTAssertEqual(result.color.bytes, [0, 0, 0])
        XCTAssertEqual(result.fallback, "unattainable-contrast")
    }
}
