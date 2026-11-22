import XCTest
import TextHue

final class PresetTests: XCTestCase {
    func testSharedPresetRenditions() throws {
        struct Row: Decodable {
            let options: RenderOptions
            let text: String
            let light, dark: [String: String]
        }
        let rows = try fixture("presets-v1.json", as: [Row].self)
        XCTAssertEqual(rows.count, 20)
        for row in rows {
            let result = try Renderer(options: row.options).resolve(row.text)
            XCTAssertEqual(result.light.mapValues(\.hex), row.light)
            XCTAssertEqual(result.dark.mapValues(\.hex), row.dark)
        }
    }
}
