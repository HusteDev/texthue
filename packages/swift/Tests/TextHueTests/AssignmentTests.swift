import Foundation
import XCTest
import TextHue

final class AssignmentTests: XCTestCase {
    struct Row: Decodable {
        struct Report: Decodable {
            let minDistance: Double?
            let closestPairs: [[String]]
            let withinRingCapacity, distinctFills: Bool
        }
        let options: RenderOptions?
        let texts: [String]
        let pinned: [String: Placement]?
        let assignments: [String: Placement]
        let lightFills: [String: String]
        let report: Report
    }

    func testSharedAssignments() throws {
        func keyed<T>(_ values: [String: T]) -> [Data: T] {
            Dictionary(uniqueKeysWithValues: values.map { (Data($0.key.utf8), $0.value) })
        }
        for row in try fixture("assign-vectors.json", as: [Row].self) {
            let renderer = try Renderer(options: row.options ?? RenderOptions())
            let actual = try renderer.assign(row.texts, pinned: keyed(row.pinned ?? [:]))
            XCTAssertEqual(actual.assignments, keyed(row.assignments))
            XCTAssertEqual(actual.colors.mapValues { $0.light["fill"]!.hex }, keyed(row.lightFills))
            XCTAssertEqual(actual.report.closestPairs, row.report.closestPairs.map { $0.map { Data($0.utf8) } })
            XCTAssertEqual(actual.report.withinRingCapacity, row.report.withinRingCapacity)
            XCTAssertEqual(actual.report.distinctFills, row.report.distinctFills)
            if let expected = row.report.minDistance {
                XCTAssertEqual(try XCTUnwrap(actual.report.minDistance), expected, accuracy: 1e-12)
            } else {
                XCTAssertNil(actual.report.minDistance)
            }
        }
    }

    func testByteDistinctLabelsSurviveReplay() throws {
        let renderer = try Renderer()
        let labels = ["é", "e\u{301}"]
        let result = try renderer.assign(labels)
        XCTAssertEqual(result.colors.count, 2)
        XCTAssertEqual(try renderer.assign(labels.reversed(), pinned: result.assignments).colors, result.colors)
    }
}
