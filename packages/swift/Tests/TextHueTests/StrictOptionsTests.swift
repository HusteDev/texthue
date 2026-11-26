import Foundation
import XCTest
@testable import TextHue

final class StrictOptionsTests: XCTestCase {
    func testUnknownAndNullOptions() {
        for input in [#"{"extra":3}"#, #"{"seed":null}"#, #"{"normalize":{"case":null}}"#,
                      #"{"profiles":{"dark":{"fill":{"chroma":0.2}}}}"#,
                      ##"{"palette":[{"id":"a","light":"#abcdef","extra":0}]}"##] {
            XCTAssertThrowsError(try JSONDecoder().decode(RenderOptions.self, from: Data(input.utf8)))
        }
    }

    func testRawUTF16() throws {
        let renderer = try Renderer()
        XCTAssertEqual(try renderer.resolve(utf16: [0xd83d, 0xde00]), try renderer.resolve("😀"))
        XCTAssertThrowsError(try renderer.resolve(utf16: [0xd800])) { error in
            XCTAssertEqual((error as? RenderError)?.code, "INVALID_TEXT")
        }
    }

    func testSendableValues() throws {
        func accept<T: Sendable>(_: T) {}
        let renderer = try Renderer()
        accept(renderer)
        accept(try renderer.resolve("label"))
        accept(try renderer.assign(["a", "b"]))
    }
}
