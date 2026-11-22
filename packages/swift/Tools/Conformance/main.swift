import Foundation
import TextHue

struct Request: Decodable {
    let text: String
    let options: RenderOptions?
    let exportConfig: Bool?
    let config: UnsupportedConfig?
}

// The Swift port implements the core renderer. Reject extended replay requests.
struct UnsupportedConfig: Decodable {}

do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let requests = try JSONDecoder().decode([Request].self, from: input)
    let results = try requests.map { request in
        guard request.config == nil, request.exportConfig != true else {
            throw RenderError.invalidOptions
        }
        return try Renderer(options: request.options ?? RenderOptions()).resolve(request.text)
    }
    FileHandle.standardOutput.write(try JSONEncoder().encode(results))
} catch {
    FileHandle.standardError.write(Data("Swift conformance input failed: \(error)\n".utf8))
    exit(1)
}
