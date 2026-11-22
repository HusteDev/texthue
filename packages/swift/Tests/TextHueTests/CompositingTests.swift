import XCTest
@testable import TextHue

final class CompositingTests: XCTestCase {
    func testReferencePixels() throws {
        struct Row: Decodable { let source, backdrop, expected: String; let alpha: Double }
        func color(_ hex: String) throws -> Color {
            let n = try XCTUnwrap(UInt32(hex.dropFirst(), radix: 16))
            return Color(rgb: RGB(r: UInt8(n >> 16), g: UInt8((n >> 8) & 255), b: UInt8(n & 255)))
        }
        let rows = try fixture("composite-v1.json", as: [Row].self)
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            let actual = try compositeOver(color(row.source), alpha: row.alpha, backdrop: color(row.backdrop))
            XCTAssertEqual(actual, try color(row.expected))
        }
    }

    func testInvalidAlpha() {
        let black = Color(rgb: RGB(r: 0, g: 0, b: 0))
        for alpha in [-0.1, 1.1, .nan, .infinity, -.infinity] {
            XCTAssertThrowsError(try compositeOver(black, alpha: alpha, backdrop: black)) {
                XCTAssertEqual($0 as? CompositingError, .invalidAlpha)
            }
        }
    }
}
