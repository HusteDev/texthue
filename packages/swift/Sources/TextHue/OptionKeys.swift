private struct OptionKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

/// Synthesized keyed decoders omit unknown keys and treat an explicit null as absent.
func validateOptionKeys(_ decoder: Decoder, allowed: Set<String>) throws {
    let fields = try decoder.container(keyedBy: OptionKey.self)
    for key in fields.allKeys {
        guard allowed.contains(key.stringValue), try !fields.decodeNil(forKey: key) else {
            throw RenderError.invalidOptions
        }
    }
}
