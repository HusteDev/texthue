import Foundation

func fixtureData(_ name: String) throws -> Data {
    guard let url = Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures") else {
        throw CocoaError(.fileNoSuchFile, userInfo: [NSFilePathErrorKey: name])
    }
    return try Data(contentsOf: url)
}

func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    try JSONDecoder().decode(type, from: fixtureData(name))
}
