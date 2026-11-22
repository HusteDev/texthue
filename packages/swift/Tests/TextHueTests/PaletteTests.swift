import XCTest
import TextHue

final class PaletteTests: XCTestCase {
    let entries = [PaletteEntry(id: "red", light: "#ab1234"),
                   PaletteEntry(id: "gray", dark: "#777777"),
                   PaletteEntry(id: "blue", light: "#1020ab", dark: "#2233cd")]

    func testReferenceWinnersAndReordering() throws {
        var options = RenderOptions()
        options.palette = entries
        let labels = ["apple", "pear", "a", "b", "x", "z"]
        let result = try Renderer(options: options).batch(labels)
        XCTAssertEqual(result.map { $0.light["fill"]?.hex },
                       ["#1020ab", "#ab1234", "#1020ab", "#1020ab", "#ab1234", "#777777"])
        XCTAssertEqual(result.first?.dark["fill"]?.hex, "#2233cd")
        XCTAssertTrue(result.allSatisfy { $0.source == "palette" })
        options.palette = entries.reversed()
        XCTAssertEqual(try Renderer(options: options).batch(labels), result)
        options.overrides = ["apple": BrandColors(light: "#ffeedd", dark: "#001122")]
        let branded = try Renderer(options: options)
        for (label, source) in [("apple", "override"), ("pear", "palette")] {
            let full = try branded.resolve(label)
            XCTAssertEqual(full.source, source)
            for (dark, theme) in [(false, full.light), (true, full.dark)] {
                for (role, color) in theme {
                    XCTAssertEqual(try branded.hex(label, dark: dark, role: role), color.hex)
                    XCTAssertEqual(try branded.color(label, dark: dark, role: role), color)
                }
            }
        }
        XCTAssertThrowsError(try branded.hex("apple", role: "missing"))
        XCTAssertThrowsError(try branded.color("pear", dark: true, role: "missing"))
    }

    func testBothThemesMustPassAndAllFailStillSelects() throws {
        var options = RenderOptions()
        options.foregrounds = ["#ffffff"]
        options.contrastTarget = 21
        options.palette = [PaletteEntry(id: "red", light: "#000000", dark: "#ffffff"),
                           PaletteEntry(id: "gray", light: "#000000")]
        let chosen = try Renderer(options: options).resolve("pear")
        XCTAssertEqual(chosen.dark["fill"]?.hex, "#000000")
        options.palette = entries
        XCTAssertEqual(try Renderer(options: options).resolve("pear").light["fill"]?.hex, "#ab1234")
        for invalid in [[], [entries[0], entries[0]], [PaletteEntry(id: "missing")]] {
            options.palette = invalid
            XCTAssertThrowsError(try Renderer(options: options))
        }
    }
}
