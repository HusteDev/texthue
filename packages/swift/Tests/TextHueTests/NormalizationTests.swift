import XCTest
@testable import TextHue

final class NormalizationTests: XCTestCase {
    func testNormalizedIdentity() throws {
        struct Row: Decodable {
            let text, namespace, digest: String
            let normalize: Normalization
            let seed: UInt32
            let hue: Double
        }
        let rows = try fixture("normalization-v1.json", as: [Row].self)
        XCTAssertEqual(rows.count, 90)
        for row in rows {
            let digest = try identityDigest(row.normalize.apply(row.text),
                namespace: row.normalize.apply(row.namespace), seed: row.seed)
            XCTAssertEqual(digest.map { String(format: "%02x", $0) }.joined(), row.digest)
            let palette = try Renderer(namespace: row.namespace, seed: row.seed, normalize: row.normalize).resolve(row.text)
            XCTAssertEqual(palette.hue, row.hue, accuracy: 1e-12)
        }
    }
}
