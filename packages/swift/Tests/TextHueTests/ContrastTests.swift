import Foundation
import XCTest
@testable import TextHue

final class ContrastTests: XCTestCase {
    func testSRGBReference() throws {
        let rows = try fixture("apca-srgb-v1.json", as: [[Double]].self)
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            XCTAssertEqual(ContrastModel.apca.measure(text: row[0..<3].map(UInt8.init),
                background: row[3..<6].map(UInt8.init), gamut: .sRGB), row[6], accuracy: 1e-12)
        }
    }

    func testDisplayP3Reference() throws {
        struct Row: Decodable {
            let text, background: [UInt8]
            let ratio, lc: Double
        }
        let rows = try fixture("p3-contrast-v1.json", as: [Row].self)
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            XCTAssertEqual(ContrastModel.wcag2.measure(text: row.text, background: row.background,
                gamut: .displayP3), row.ratio, accuracy: 1e-12)
            XCTAssertEqual(ContrastModel.apca.measure(text: row.text, background: row.background,
                gamut: .displayP3), row.lc, accuracy: 1e-12)
        }
    }
}
