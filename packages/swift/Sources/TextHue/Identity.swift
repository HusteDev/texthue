import Foundation
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

func identityDigest(_ text: String, namespace: String, seed: UInt32) throws -> [UInt8] {
    let scope = Data(namespace.utf8)
    guard let length = UInt32(exactly: scope.count) else { throw RenderError.invalidOptions }
    var hash = SHA256()
    hash.update(data: Data("text-to-color-v1\u{0}".utf8))
    for word in [seed, length] {
        withUnsafeBytes(of: word.bigEndian) { hash.update(bufferPointer: $0) }
    }
    hash.update(data: scope)
    hash.update(data: Data(text.utf8))
    return Array(hash.finalize())
}

func identityFractions(_ digest: [UInt8]) -> [Double] {
    stride(from: 0, to: 12, by: 4).map { offset in
        let word = digest[offset..<(offset + 4)].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        return Double(word) / 4294967296
    }
}

func paletteRank(_ digest: [UInt8], _ id: Data) -> [UInt8] {
    var hash = SHA256()
    hash.update(data: Data(digest))
    hash.update(data: id)
    return Array(hash.finalize())
}
