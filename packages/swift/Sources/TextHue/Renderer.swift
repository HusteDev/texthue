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

public enum RenderError: Error { case invalidOptions }

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

    private let foregrounds: [[UInt8]]
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
        let parsedForegrounds = try candidates.map {
            let rgb = try RGB(hex: $0)
            return [rgb.r, rgb.g, rgb.b]
        }
        foregrounds = parsedForegrounds
        var compiled: [RankedEntry] = []
        var passing: [RankedEntry] = []
        var ids = Set<Data>()
        let model = options.contrastModel ?? .wcag2
        let target = options.contrastTargets?["fill"] ?? options.contrastTarget
            ?? (model == .apca ? 60 : options.preset == .controls ? 7 : 4.5)
        func passes(_ tone: FixedTone) -> Bool {
            parsedForegrounds.contains { abs(model.measure(text: $0, background: tone.bytes, gamut: .sRGB)) >= target }
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
        func fixed(_ light: FixedTone, _ dark: FixedTone, source: String) throws -> RenderedPalette {
            try RenderedPalette(version: "text-to-color-v1", source: source, hueFraction: light.fraction,
                                hue: light.hue, lightTheme: theme("light", light.hue, 0.5, 0.5, light),
                                darkTheme: theme("dark", dark.hue, 0.5, 0.5, dark))
        }
        if let (light, dark) = fixedColors[Data(name.utf8)] {
            return try fixed(light, dark, source: "override")
        }
        let digest = try identityDigest(name, namespace: scope, seed: options.seed ?? 0)
        var bestRank: [UInt8] = []
        var winner: RankedEntry?
        for entry in rankedEntries {
            let rank = paletteRank(digest, entry.id)
            if bestRank.lexicographicallyPrecedes(rank) {
                bestRank = rank
                winner = entry
            }
        }
        if let winner { return try fixed(winner.light, winner.dark, source: "palette") }
        let fractions = identityFractions(digest)
        return try render(hueFraction: fractions[0], lightness: fractions[1], chroma: fractions[2])
    }

    private func render(hueFraction: Double, lightness: Double, chroma: Double) throws -> RenderedPalette {
        let position = hueFraction * 12, slot = Int(position)
        let naturalHue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - Double(slot)))
            .truncatingRemainder(dividingBy: 360)
        let hue = hueDomain.map(naturalHue)
        return try RenderedPalette(version: "text-to-color-v1", source: "hash", hueFraction: hueFraction,
                                   hue: hue, lightTheme: theme("light", hue, lightness, chroma),
                                   darkTheme: theme("dark", hue, lightness, chroma))
    }

    private func theme(_ name: String, _ hue: Double, _ uL: Double, _ uC: Double, _ fixed: FixedTone? = nil) throws -> ReportedTheme {
        let dark = name == "dark", direction: Double = dark ? 1 : -1
        let base = dark ? darkBackground : lightBackground
        let bg = base.bytes, lb = base.lightness
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
            return (min(1, max(0, range[0] + (range[1] - range[0]) * uL + offset)),
                    scale[0] + (scale[1] - scale[0]) * uC, cap)
        }
        let fillP = sampled("fill"), textP = sampled("text")
        func score(_ a: [UInt8], _ b: [UInt8]) -> Double {
            abs(model.measure(text: a, background: b, gamut: .sRGB))
        }
        func foreground(_ bytes: [UInt8], target: Double) -> [UInt8] {
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
                  _ target: Double, _ back: [UInt8]? = nil, _ second: [UInt8]? = nil, surface: Bool = false) -> [UInt8] {
            let l = min(1, max(0, value))
            let requested = Gamut.sRGB.cusp(lightness: l, hue: hue) * profile.scale
            let c = min(profile.cap, requested)
            let secondary = second == nil ? 0 : required("textOnSubtle")
            let threshold = target == 0 ? secondary : target
            let result = Gamut.sRGB.repair(lightness: l, chroma: c, hue: hue, target: threshold) { bytes in
                let primary: Double
                if let back { primary = surface ? score(back, bytes) : score(bytes, back) }
                else { primary = score(foreground(bytes, target: target), bytes) }
                guard let second, secondary > 0 else { return primary }
                let secondScore = score(bytes, second)
                return target == 0 ? secondScore : min(primary, secondScore * (target / secondary))
            }
            metadata[role] = (result.color.lightness != l, requested > profile.cap, result.color.chroma < c, result.fallback)
            return result.color.bytes
        }
        let subtle = tone("subtle", lb + direction * 0.04, fillP, unconstrained)
        let fill = fixed?.bytes ?? tone("fill", fillP.l, fillP, required("fill")), onFill = foreground(fill, target: required("fill"))
        let roles = [
            "background": bg, "subtle": subtle, "muted": tone("muted", lb + direction * 0.10, fillP, unconstrained),
            "fill": fill, "onFill": onFill,
            "fillHover": tone("fillHover", (fixed?.lightness ?? fillP.l) + direction * 0.025, fillP, required("fillHover"), onFill, surface: true),
            "fillActive": tone("fillActive", (fixed?.lightness ?? fillP.l) + direction * 0.05, fillP, required("fillActive"), onFill, surface: true),
            "border": tone("border", lb + direction * 0.39, fillP, required("border"), bg),
            "text": tone("text", textP.l, textP, required("text"), bg, subtle),
            "strong": tone("strong", textP.l + direction * 0.10, textP, required("strong"), bg)
        ]
        var relationships: [String: ContrastRelationship] = [:]
        for role in ["fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong"] {
            let colorRole = role == "textOnSubtle" ? "text" : role
            let surface = ["fill", "fillHover", "fillActive"].contains(role)
            let color = roles[colorRole]!
            let front = surface ? onFill : color
            let back = surface ? color : role == "textOnSubtle" ? subtle : bg
            let measured = model.measure(text: front, background: back, gamut: .sRGB)
            let passes = abs(measured) >= required(role)
            let flags = metadata[colorRole]
            let fallback = role == "fill" && fixed != nil && !passes ? "palette-constraint" : flags?.fallback
            relationships[role] = ContrastRelationship(
                ratio: ContrastModel.wcag2.measure(text: front, background: back, gamut: .sRGB),
                meetsTarget: passes, lightnessAdjusted: flags?.adjusted ?? false, chromaCapped: flags?.capped ?? false,
                chromaReduced: flags?.reduced ?? false, fallback: fallback,
                model: model == .apca ? "apca" : nil, value: model == .apca ? measured : nil)
        }
        return ReportedTheme(colors: roles.mapValues { Color(rgb: RGB(r: $0[0], g: $0[1], b: $0[2])) },
                             contrast: ContrastReport(target: target, relationships: relationships))
    }
}
