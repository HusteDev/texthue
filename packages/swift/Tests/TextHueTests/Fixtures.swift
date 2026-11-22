import Foundation

func fixtureData(_ name: String) throws -> Data {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    return try Data(contentsOf: root.appendingPathComponent("conformance/" + name))
}

func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    try JSONDecoder().decode(type, from: fixtureData(name))
}

