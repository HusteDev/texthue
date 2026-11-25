import Foundation

public struct RoleProfile: Decodable {
    public var lightness: [Double]?
    public var chromaScale: [Double]?
    public var chromaCap: Double?

    public init(lightness: [Double]? = nil, chromaScale: [Double]? = nil, chromaCap: Double? = nil) {
        self.lightness = lightness
        self.chromaScale = chromaScale
        self.chromaCap = chromaCap
    }

    fileprivate func validate() throws {
        for pair in [lightness, chromaScale].compactMap({ $0 }) {
            guard pair.count == 2, pair[0] >= 0, pair[1] <= 1, pair[0] <= pair[1] else {
                throw RenderError.invalidOptions
            }
        }
        if let chromaCap, !(0...0.4).contains(chromaCap) { throw RenderError.invalidOptions }
    }
}

public enum ForegroundPolicy: String, Decodable {
    case best
    case firstPassing = "first-passing"
}

public enum Preset: String, Decodable {
    case labels, controls, chart, subdued, mono

    fileprivate var chromaScale: [Double] {
        switch self {
        case .labels, .controls: [0.6, 0.8]
        case .chart: [0.8, 1]
        case .subdued: [0.2, 0.4]
        case .mono: [0, 0]
        }
    }
}

public struct PaletteEntry: Decodable {
    public let id: String
    public let light, dark: String?

    public init(id: String, light: String? = nil, dark: String? = nil) {
        self.id = id
        self.light = light
        self.dark = dark
    }
}

public struct BrandColors: Decodable {
    public let light, dark: String

    public init(light: String, dark: String) {
        self.light = light
        self.dark = dark
    }

    private enum CodingKeys: String, CodingKey { case light, dark }

    public init(from decoder: Decoder) throws {
        if let hex = try? decoder.singleValueContainer().decode(String.self) {
            self.init(light: hex, dark: hex)
        } else {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(light: values.decode(String.self, forKey: .light),
                          dark: values.decode(String.self, forKey: .dark))
        }
    }
}

public struct RenderOptions: Decodable {
    public var gamut: Gamut?
    public var hueRange: [Double]?
    public var excludeHues: [[Double]]?
    public var palette: [PaletteEntry]?
    public var overrides: [String: BrandColors]?
    public var preset: Preset?
    public var normalize: Normalization?
    public var namespace: String?
    public var seed: UInt32?
    public var foregrounds: [String]?
    public var foregroundPolicy: ForegroundPolicy?
    public var contrastModel: ContrastModel?
    public var contrastTarget: Double?
    public var contrastTargets: [String: Double]?
    public var backgrounds: [String: String]?
    public var profiles: [String: [String: RoleProfile]]?

    public init() {}
}

public enum RenderError: Error { case invalidOptions, unmetConstraint }

private extension RGB {
    init(hex raw: String) throws {
        let digits = raw.utf8.dropFirst()
        guard raw.first == "#", digits.count == 6,
              digits.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }),
              let n = UInt32(raw.dropFirst(), radix: 16) else { throw RenderError.invalidOptions }
        self.init(r: UInt8(n >> 16), g: UInt8((n >> 8) & 255), b: UInt8(n & 255))
    }
}

private struct FixedTone {
    let bytes: [UInt8]
    let hue, lightness: Double
    let neutral: Bool

    init(_ hex: String) throws {
        let rgb = try RGB(hex: hex)
        let coordinates = Color(rgb: rgb).oklch
        bytes = [rgb.r, rgb.g, rgb.b]
        hue = (floor(coordinates.h * 1024 + 0.5) / 1024).truncatingRemainder(dividingBy: 360)
        lightness = floor(coordinates.l * 4096 + 0.5) / 4096
        neutral = coordinates.c == 0
    }

    var fraction: Double {
        let angle = hue < anchors[0] ? hue + 360 : hue
        let i = anchors.lastIndex(where: { $0 <= angle })!
        return (Double(i) + (angle - anchors[i]) / (anchors[i + 1] - anchors[i])) / 12
    }
}

private struct ThemeBackground {
    let bytes: [UInt8]
    let lightness: Double

    init(_ raw: String) throws {
        let rgb = try RGB(hex: raw)
        bytes = [rgb.r, rgb.g, rgb.b]
        lightness = floor(Color(rgb: rgb).oklch.l * 4096 + 0.5) / 4096
    }
}

public struct ContrastRelationship: Equatable, Codable {
    public let ratio: Double
    public let meetsTarget, lightnessAdjusted, chromaCapped, chromaReduced: Bool
    public let fallback: String?
    public let model: String?
    public let value: Double?

    enum CodingKeys: String, CodingKey {
        case ratio, meetsTarget, lightnessAdjusted, chromaCapped, chromaReduced, fallback, model, value
    }

    public func encode(to encoder: Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(ratio, forKey: .ratio)
        try fields.encode(meetsTarget, forKey: .meetsTarget)
        try fields.encode(lightnessAdjusted, forKey: .lightnessAdjusted)
        try fields.encode(chromaCapped, forKey: .chromaCapped)
        try fields.encode(chromaReduced, forKey: .chromaReduced)
        try fields.encode(fallback, forKey: .fallback)
        try fields.encodeIfPresent(model, forKey: .model)
        try fields.encodeIfPresent(value, forKey: .value)
    }
}

public struct ContrastReport: Equatable, Encodable {
    public let target: Double
    public let relationships: [String: ContrastRelationship]
    enum CodingKeys: String, CodingKey { case target }
    public func encode(to encoder: Encoder) throws {
        try relationships.encode(to: encoder)
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(target, forKey: .target)
    }
}

private struct ReportedTheme: Equatable, Encodable {
    let colors: [String: Color]
    let contrast: ContrastReport
    enum CodingKeys: String, CodingKey { case contrast }
    func encode(to encoder: Encoder) throws {
        try colors.encode(to: encoder)
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(contrast, forKey: .contrast)
    }
}

public struct RenderedPalette: Equatable, Encodable {
    public let version: String
    public let source: String
    public let hueFraction: Double
    public let hue: Double
    fileprivate let lightTheme, darkTheme: ReportedTheme
    public var light: [String: Color] { lightTheme.colors }
    public var dark: [String: Color] { darkTheme.colors }
    public var lightContrast: ContrastReport { lightTheme.contrast }
    public var darkContrast: ContrastReport { darkTheme.contrast }
    enum CodingKeys: String, CodingKey {
        case version, source, hueFraction, hue, lightTheme = "light", darkTheme = "dark"
    }
}

public struct Renderer {
    let options: RenderOptions

    private let normalization: Normalization
    private let hueDomain: HueDomain
    private struct RankedEntry {
        let id: Data
        let light, dark: FixedTone
    }
    private let rankedEntries: [RankedEntry]
    private let fixedColors: [Data: (FixedTone, FixedTone)]
    private let scope: String

    private let gamut: Gamut
    private let foregrounds: [[Double]]
    private let lightBackground, darkBackground: ThemeBackground

    public init(options: RenderOptions) throws {
        hueDomain = try HueDomain(allowed: options.hueRange ?? [0, 360], excluded: options.excludeHues ?? [])
        let themes = ["light", "dark"]
        let roles = ["fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong"]
        let range: ClosedRange<Double> = options.contrastModel == .apca ? 0...106 : 1...21
        guard range.contains(options.contrastTarget ?? range.lowerBound),
              (options.contrastTargets ?? [:]).allSatisfy({ roles.contains($0.key) && range.contains($0.value) }),
              (options.backgrounds ?? [:]).keys.allSatisfy(themes.contains) else { throw RenderError.invalidOptions }
        for (theme, profiles) in options.profiles ?? [:] {
            guard themes.contains(theme) else { throw RenderError.invalidOptions }
            for (role, profile) in profiles {
                guard role == "fill" || role == "text" else { throw RenderError.invalidOptions }
                try profile.validate()
            }
        }
        let candidates = options.foregrounds ?? ["#000000", "#ffffff"]
        guard !candidates.isEmpty else { throw RenderError.invalidOptions }
        let gamut = options.gamut ?? .sRGB
        self.gamut = gamut
        let parsedForegrounds = try candidates.map {
            let rgb = try RGB(hex: $0)
            return gamut.canonicalChannels(sRGB: [rgb.r, rgb.g, rgb.b])
        }
        foregrounds = parsedForegrounds
        var compiled: [RankedEntry] = []
        var passing: [RankedEntry] = []
        var ids = Set<Data>()
        let model = options.contrastModel ?? .wcag2
        let target = options.contrastTargets?["fill"] ?? options.contrastTarget
            ?? (model == .apca ? 60 : options.preset == .controls ? 7 : 4.5)
        func passes(_ tone: FixedTone) -> Bool {
            parsedForegrounds.contains { abs(model.measure(encodedText: $0, background: gamut.canonicalChannels(sRGB: tone.bytes), gamut: gamut)) >= target }
        }
        if let palette = options.palette {
            guard !palette.isEmpty else { throw RenderError.invalidOptions }
            for entry in palette {
                let key = Data(entry.id.utf8)
                guard ids.insert(key).inserted, let light = entry.light ?? entry.dark,
                      let dark = entry.dark ?? entry.light else { throw RenderError.invalidOptions }
                let item = try RankedEntry(id: key, light: FixedTone(light), dark: FixedTone(dark))
                compiled.append(item)
                if passes(item.light) && passes(item.dark) { passing.append(item) }
            }
        }
        rankedEntries = passing.isEmpty ? compiled : passing
        lightBackground = try ThemeBackground(options.backgrounds?["light"] ?? "#ffffff")
        darkBackground = try ThemeBackground(options.backgrounds?["dark"] ?? "#121212")
        self.options = options
        let normalization = options.normalize ?? Normalization()
        var fixed: [Data: (FixedTone, FixedTone)] = [:]
        for (label, colors) in options.overrides ?? [:] {
            let key = Data(normalization.apply(label).utf8)
            guard fixed[key] == nil else { throw RenderError.invalidOptions }
            fixed[key] = try (FixedTone(colors.light), FixedTone(colors.dark))
        }
        fixedColors = fixed
        self.normalization = normalization
        self.scope = normalization.apply(options.namespace ?? "")
    }

    public init(namespace: String = "", seed: UInt32 = 0, contrastTarget: Double = 4.5, normalize: Normalization = Normalization()) throws {
        var options = RenderOptions()
        options.normalize = normalize
        options.namespace = namespace
        options.seed = seed
        options.contrastTarget = contrastTarget
        try self.init(options: options)
    }

    public func resolve(_ text: String) throws -> RenderedPalette {
        try resolveNormalized(normalization.apply(text))
    }

    /// Resolve in input order, sharing work for identical normalized UTF-8 bytes within this batch.
    public func batch(_ texts: [String]) throws -> [RenderedPalette] {
        var cache: [Data: RenderedPalette] = [:]
        return try texts.map { text in
            let name = normalization.apply(text)
            // Swift String equality treats canonically equivalent spellings as equal.
            let key = Data(name.utf8)
            if let palette = cache[key] { return palette }
            let palette = try resolveNormalized(name)
            cache[key] = palette
            return palette
        }
    }

    private func resolveNormalized(_ name: String) throws -> RenderedPalette {
        try render(mapping(name))
    }

    private func render(_ mapped: Mapping) throws -> RenderedPalette {
        return try RenderedPalette(version: "text-to-color-v1", source: mapped.source, hueFraction: mapped.fraction,
                                   hue: mapped.hue, lightTheme: theme("light", mapped), darkTheme: theme("dark", mapped))
    }

    private typealias Mapping = (source: String, fraction: Double, hue: Double, l: Double, c: Double,
                                 light: FixedTone?, dark: FixedTone?, ring: Int)

    public func color(_ text: String, dark: Bool = false, role: String = "fill") throws -> Color {
        let bytes = try selected(text, dark, role)
        return Color(encoded: bytes, gamut: gamut)
    }

    public func hex(_ text: String, dark: Bool = false, role: String = "fill", strict: Bool = false) throws -> String {
        if !strict { return try outputHex(selected(text, dark, role)) }
        let mapped = try mapping(normalization.apply(text))
        let name = dark ? "dark" : "light"
        let pairs = role == "text" ? ["text", "textOnSubtle"] : [role == "onFill" ? "fill" : role]
        var needed = [role]
        for pair in pairs {
            if let (front, back) = contrastRoles(pair) {
                for item in [front, back] where !needed.contains(item) { needed.append(item) }
            }
        }
        let colors = try rawTheme(name, mapped, needed).roles
        for pair in pairs {
            guard let (front, back) = contrastRoles(pair) else { continue }
            let model = options.contrastModel ?? .wcag2
            let value = model.measure(encodedText: colors[front]!, background: colors[back]!, gamut: gamut)
            if abs(value) < requiredContrast(pair) { throw RenderError.unmetConstraint }
        }
        return outputHex(colors[role]!)
    }

    private func outputHex(_ encoded: [Double]) -> String {
        if gamut == .sRGB { return Color.hexString(encoded.map(UInt8.init)) }
        let rgb = Gamut.p3Fallback(encoded: encoded).rgb
        return Color.hexString([rgb.r, rgb.g, rgb.b])
    }

    private func contrastRoles(_ pair: String) -> (String, String)? {
        switch pair {
        case "fill", "fillHover", "fillActive": ("onFill", pair)
        case "textOnSubtle": ("text", "subtle")
        case "text", "strong", "border": (pair, "background")
        default: nil
        }
    }

    private func requiredContrast(_ role: String) -> Double {
        let model = options.contrastModel ?? .wcag2
        let target = options.contrastTarget ?? (model == .apca ? 60 : options.preset == .controls ? 7 : 4.5)
        return options.contrastTargets?[role] ?? (role == "border" && model == .wcag2 ? min(target, 3) : target)
    }

    private func selected(_ text: String, _ dark: Bool, _ role: String) throws -> [Double] {
        let mapped = try mapping(normalization.apply(text))
        return try rawTheme(dark ? "dark" : "light", mapped, [role]).roles[role]!
    }

    private func mapping(_ name: String, digest existing: [UInt8]? = nil) throws -> Mapping {
        func fixed(_ light: FixedTone, _ dark: FixedTone, source: String) -> Mapping {
            (source, light.fraction, light.hue, 0.5, 0.5, light, dark, 0)
        }
        if let (light, dark) = fixedColors[Data(name.utf8)] {
            return fixed(light, dark, source: "override")
        }
        let digest = try existing ?? identityDigest(name, namespace: scope, seed: options.seed ?? 0)
        var bestRank: [UInt8] = []
        var winner: RankedEntry?
        for entry in rankedEntries {
            let rank = paletteRank(digest, entry.id)
            if bestRank.lexicographicallyPrecedes(rank) {
                bestRank = rank
                winner = entry
            }
        }
        if let winner { return fixed(winner.light, winner.dark, source: "palette") }
        let fractions = identityFractions(digest)
        return ("hash", fractions[0], mappedHue(fractions[0]), fractions[1], fractions[2], nil, nil, 0)
    }

    private func mappedHue(_ fraction: Double) -> Double {
        let position = fraction * 12, slot = Int(position)
        let naturalHue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - Double(slot)))
            .truncatingRemainder(dividingBy: 360)
        return hueDomain.map(naturalHue)
    }

    private typealias Flags = (adjusted: Bool, capped: Bool, reduced: Bool, fallback: String?)
    private func rawTheme(_ name: String, _ mapped: Mapping, _ requestedRoles: [String]) throws
        -> (roles: [String: [Double]], metadata: [String: Flags]) {
        let dark = name == "dark", direction: Double = dark ? 1 : -1
        let fixed = dark ? mapped.dark : mapped.light
        let hue = fixed?.hue ?? mapped.hue, uL = mapped.l, uC = mapped.c
        let base = dark ? darkBackground : lightBackground
        let bg = gamut.canonicalChannels(sRGB: base.bytes), lb = base.lightness
        let model = options.contrastModel ?? .wcag2
        let preset = options.preset ?? .labels
        let target = options.contrastTarget ?? (model == .apca ? 60 : preset == .controls ? 7 : 4.5)
        let unconstrained: Double = model == .apca ? 0 : 1
        func required(_ role: String) -> Double {
            options.contrastTargets?[role] ?? (role == "border" && model == .wcag2 ? min(target, 3) : target)
        }
        func sampled(_ role: String) -> (l: Double, scale: Double, cap: Double) {
            let profile = options.profiles?[name]?[role]
            let fill = role == "fill"
            let range = profile?.lightness ?? (dark ? (fill ? [0.4,0.5] : [0.72,0.82]) :
                                                (fill ? [0.72,0.82] : [0.43,0.53]))
            let scale = profile?.chromaScale ?? preset.chromaScale
            let cap = fixed?.neutral == true ? 0 : profile?.chromaCap ?? (fill ? 0.16 : 0.19)
            let bias = biases[(dark ? 2 : 0) + (fill ? 0 : 1)], sector = Int(hue / 30)
            let offset = bias[sector] + (bias[(sector + 1) % 12] - bias[sector]) * (hue / 30 - Double(sector))
            return (min(1, max(0, range[0] + (range[1] - range[0]) * uL + offset + Placement.offsets[mapped.ring])),
                    (scale[0] + (scale[1] - scale[0]) * uC) * (mapped.ring < 3 ? 1 : 0.6), cap)
        }
        let fillP = sampled("fill"), textP = sampled("text")
        func score(_ a: [Double], _ b: [Double]) -> Double {
            abs(model.measure(encodedText: a, background: b, gamut: gamut))
        }
        func foreground(_ bytes: [Double], target: Double) -> [Double] {
            var best = foregrounds[0], bestScore = -1.0
            for candidate in foregrounds {
                let value = score(candidate, bytes)
                if options.foregroundPolicy == .firstPassing && value >= target { return candidate }
                if value > bestScore {
                    best = candidate
                    bestScore = value
                }
            }
            return best
        }
        var metadata: [String: (adjusted: Bool, capped: Bool, reduced: Bool, fallback: String?)] = [:]
        func tone(_ role: String, _ value: Double, _ profile: (l: Double, scale: Double, cap: Double),
                  _ target: Double, _ back: [Double]? = nil, _ second: [Double]? = nil, surface: Bool = false) -> [Double] {
            let l = min(1, max(0, value))
            let requested = gamut.cusp(lightness: l, hue: hue) * profile.scale
            let c = min(profile.cap, requested)
            let secondary = second == nil ? 0 : required("textOnSubtle")
            let threshold = target == 0 ? secondary : target
            let result = gamut.repair(lightness: l, chroma: c, hue: hue, target: threshold) { fitted in
                let bytes = fitted.map(Double.init)
                if hueDomain.excludes(bytes, gamut: gamut) { return -Double.infinity }
                let primary: Double
                if let back { primary = surface ? score(back, bytes) : score(bytes, back) }
                else { primary = score(foreground(bytes, target: target), bytes) }
                guard let second, secondary > 0 else { return primary }
                let secondScore = score(bytes, second)
                return target == 0 ? secondScore : min(primary, secondScore * (target / secondary))
            }
            metadata[role] = (result.color.lightness != l, requested > profile.cap, result.color.chroma < c, result.fallback)
            return result.color.bytes.map(Double.init)
        }
        lazy var subtle = tone("subtle", lb + direction * 0.04, fillP, unconstrained)
        lazy var fill = fixed.map { gamut.canonicalChannels(sRGB: $0.bytes) } ?? tone("fill", fillP.l, fillP, required("fill"))
        lazy var onFill = foreground(fill, target: required("fill"))
        var roles: [String: [Double]] = [:]
        for role in requestedRoles {
            roles[role] = switch role {
            case "background": bg
            case "subtle": subtle
            case "muted": tone(role, lb + direction * 0.10, fillP, unconstrained)
            case "fill": fill
            case "onFill": onFill
            case "fillHover", "fillActive":
                tone(role, (fixed?.lightness ?? fillP.l) + direction * (role == "fillHover" ? 0.025 : 0.05),
                     fillP, required(role), onFill, surface: true)
            case "border": tone(role, lb + direction * 0.39, fillP, required(role), bg)
            case "text": tone(role, textP.l, textP, required(role), bg, subtle)
            case "strong": tone(role, textP.l + direction * 0.10, textP, required(role), bg)
            default: throw RenderError.invalidOptions
            }
        }
        return (roles, metadata)
    }

    private func theme(_ name: String, _ mapped: Mapping) throws -> ReportedTheme {
        let (roles, metadata) = try rawTheme(name, mapped, ["background", "subtle", "muted", "fill", "onFill",
            "fillHover", "fillActive", "border", "text", "strong"])
        let fixed = name == "dark" ? mapped.dark : mapped.light
        let model = options.contrastModel ?? .wcag2
        let target = options.contrastTarget ?? (model == .apca ? 60 : options.preset == .controls ? 7 : 4.5)
        var relationships: [String: ContrastRelationship] = [:]
        for role in ["fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong"] {
            let colorRole = role == "textOnSubtle" ? "text" : role
            let (frontRole, backRole) = contrastRoles(role)!
            let front = roles[frontRole]!, back = roles[backRole]!
            let measured = model.measure(encodedText: front, background: back, gamut: gamut)
            let passes = abs(measured) >= requiredContrast(role)
            let flags = metadata[colorRole]
            let fallback = role == "fill" && fixed != nil && !passes ? "palette-constraint" : flags?.fallback
            relationships[role] = ContrastRelationship(
                ratio: ContrastModel.wcag2.measure(encodedText: front, background: back, gamut: gamut),
                meetsTarget: passes, lightnessAdjusted: flags?.adjusted ?? false, chromaCapped: flags?.capped ?? false,
                chromaReduced: flags?.reduced ?? false, fallback: fallback,
                model: model == .apca ? "apca" : nil, value: model == .apca ? measured : nil)
        }
        return ReportedTheme(colors: roles.mapValues { Color(encoded: $0, gamut: gamut) },
                             contrast: ContrastReport(target: target, relationships: relationships))
    }
}

extension Renderer {
    /// Registry keys are normalized UTF-8 bytes to preserve distinctions lost by String equality.
    public func assign(_ texts: [String], pinned: [Data: Placement] = [:]) throws -> Assignment {
        func key(_ text: String) -> Data { Data(normalization.apply(text).utf8) }
        let names = Set(texts.map(key))
        var placements: [Data: Placement] = [:]
        for (bytes, pin) in pinned {
            guard let text = String(data: bytes, encoding: .utf8), (0..<1).contains(pin.hueFraction),
                  (0...9007199254740991).contains(pin.ring),
                  placements.updateValue(pin, forKey: key(text)) == nil else { throw RenderError.invalidOptions }
        }
        let size = names.union(placements.keys).count
        let separation = 1 / Double(min(24, max(12, size)))
        let entries = try names.map { bytes in
            let name = String(decoding: bytes, as: UTF8.self)
            let digest = try identityDigest(name, namespace: scope, seed: options.seed ?? 0)
            return (bytes, digest, try mapping(name, digest: digest))
        }.sorted { $0.1.lexicographicallyPrecedes($1.1) }
        for (name, _, mapped) in entries where mapped.light != nil && placements[name] == nil {
            placements[name] = Placement(hueFraction: mapped.fraction, ring: 0, moved: false)
        }
        var colors: [Data: RenderedPalette] = [:]
        func placed(_ original: Mapping, _ p: Placement) throws -> RenderedPalette {
            var mapped = original
            mapped.ring = Int(p.ring % Int64(Placement.offsets.count))
            if mapped.light == nil {
                mapped.source = "assigned"
                mapped.fraction = p.hueFraction
                mapped.hue = mappedHue(p.hueFraction)
            }
            return try render(mapped)
        }
        func project(_ palette: RenderedPalette) -> [[Double]] {
            [palette.light, palette.dark].map { theme in
                let rgb = theme["fill"]!.rgb
                return Color.lab([rgb.r, rgb.g, rgb.b].map { Double($0) / 255 })
            }
        }
        var occupied = try placements.map { bytes, p in
            try project(placed(mapping(String(decoding: bytes, as: UTF8.self)), p))
        }
        func score(_ points: [[Double]]) -> Double {
            var minimum = Double.infinity
            for prior in occupied {
                for (a, b) in zip(points, prior) {
                    let squared = zip(a, b).reduce(0.0) { sum, pair in
                        let delta = pair.0 - pair.1
                        return sum + delta * delta
                    }
                    minimum = min(minimum, sqrt(squared))
                }
            }
            return minimum
        }
        for (name, _, original) in entries {
            if let fixed = placements[name] {
                colors[name] = try placed(original, fixed)
                continue
            }
            let initial = Placement.choose(original.fraction, placements.values, separation)
            var selected = initial
            var palette = try placed(original, initial)
            var points = project(palette)
            var best = score(points)
            for step in 1..<(24 * Placement.offsets.count) {
                if best >= 0.04 { break }
                let raw = initial.hueFraction + Double(step % 24) / 24
                let hue = raw - floor(raw)
                let ring = initial.ring + Int64(step / 24)
                if placements.values.contains(where: { p in
                    let delta = abs(p.hueFraction - hue)
                    return p.ring == ring && min(delta, 1 - delta) < separation
                }) { continue }
                let candidate = Placement(hueFraction: hue, ring: ring, moved: true)
                let rendered = try placed(original, candidate)
                let projected = project(rendered)
                let distance = score(projected)
                if distance > best {
                    (selected, palette, points, best) = (candidate, rendered, projected, distance)
                }
            }
            placements[name] = selected
            colors[name] = palette
            occupied.append(points)
        }
        return Assignment(assignments: placements, colors: colors, report: AssignmentReport(
            fills: entries.map { ($0.0, colors[$0.0]!.light["fill"]!) }, size: size, separation: separation))
    }
}
