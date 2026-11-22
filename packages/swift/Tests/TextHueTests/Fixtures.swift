import Foundation

func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    let bytes = try Data(contentsOf: root.appendingPathComponent("conformance/" + name))
    return try JSONDecoder().decode(type, from: bytes)
}

