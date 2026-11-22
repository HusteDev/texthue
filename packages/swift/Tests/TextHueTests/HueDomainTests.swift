import XCTest
import TextHue

final class HueDomainTests: XCTestCase {
    func testReferenceAssignments() throws {
        let cases: [([Double], [[Double]], Double, String, String)] = [
            ([300,60], [[350,10]], 341.06283164159765, "#e496c8", "#7e3668"),
            ([10,220], [[30,80],[70,120],[190,240]], 181.9565484774379, "#6dbbae", "#2f5650"),
            ([0,360], [[120,110]], 119.10628316415976, "#a4b566", "#4b532c"),
            ([35.125,35.25], [], 35.238828539551996, "#e39d8b", "#7f3e2e"),
            ([0,360], [[50,50]], 327.8261939097516, "#e491e2", "#793778")
        ]
        for (allowed, excluded, hue, light, dark) in cases {
            var options = RenderOptions()
            options.hueRange = allowed
            options.excludeHues = excluded
            let result = try Renderer(options: options).resolve("a")
            XCTAssertEqual(result.hue, hue, accuracy: 1e-12)
            XCTAssertEqual(result.light["fill"]?.hex, light)
            XCTAssertEqual(result.dark["fill"]?.hex, dark)
        }
    }

    func testInvalidDomains() {
        let cases: [([Double], [[Double]])] = [
            ([0,0], []), ([360,0], []), ([0,360], [[0,360]]),
            ([0,360], Array(repeating: [0,1], count: 17)), ([0,361], []),
            ([0,360], [[.nan,2]]), ([1], [])
        ]
        for (allowed, excluded) in cases {
            var options = RenderOptions()
            options.hueRange = allowed
            options.excludeHues = excluded
            XCTAssertThrowsError(try Renderer(options: options))
        }
    }
}
