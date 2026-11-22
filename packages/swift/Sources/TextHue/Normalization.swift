import Foundation

public struct Normalization: Decodable {
    public enum Form: String, Decodable { case none, NFC, NFKC }
    public enum Casing: String, Decodable { case none, lower }
    public enum Whitespace: String, Decodable { case none, trim, collapse }

    public let unicode: Form
    public let casing: Casing
    public let whitespace: Whitespace

    enum CodingKeys: String, CodingKey { case unicode, casing = "case", whitespace }

    public init(unicode: Form = .none, casing: Casing = .none, whitespace: Whitespace = .none) {
        self.unicode = unicode
        self.casing = casing
        self.whitespace = whitespace
    }

    public init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        self.init(unicode: try fields.decodeIfPresent(Form.self, forKey: .unicode) ?? .none,
                  casing: try fields.decodeIfPresent(Casing.self, forKey: .casing) ?? .none,
                  whitespace: try fields.decodeIfPresent(Whitespace.self, forKey: .whitespace) ?? .none)
    }

    func apply(_ input: String) -> String {
        var value = input
        switch unicode {
        case .none: break
        case .NFC: value = value.precomposedStringWithCanonicalMapping
        case .NFKC: value = value.precomposedStringWithCompatibilityMapping
        }
        if casing == .lower { value = value.lowercased(with: Locale(identifier: "en_US_POSIX")) }
        guard whitespace != .none else { return value }
        let scalars = value.unicodeScalars
        guard let first = scalars.firstIndex(where: { !$0.properties.isWhitespace }),
              let last = scalars.lastIndex(where: { !$0.properties.isWhitespace }) else { return "" }
        let trimmed = scalars[first...last]
        if whitespace == .trim { return String(trimmed) }
        return trimmed.split(whereSeparator: { $0.properties.isWhitespace }).map(String.init).joined(separator: " ")
    }
}
