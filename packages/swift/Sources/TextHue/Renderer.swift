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

public struct RenderOptions: Decodable {
    public var hueRange: [Double]?
    public var excludeHues: [[Double]]?
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

private struct ThemeBackground {
    let bytes: [UInt8]
    let lightness: Double

    init(_ raw: String) throws {
        let rgb = try RGB(hex: raw)
        bytes = [rgb.r, rgb.g, rgb.b]
        lightness = floor(Color(rgb: rgb).oklch.l * 4096 + 0.5) / 4096
    }
}

public struct RenderedPalette: Equatable {
    public let hue: Double
    public let light, dark: [String: Color]
}

public struct Renderer {
    let options: RenderOptions

    private let normalization: Normalization
    private let hueDomain: HueDomain
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
        foregrounds = try candidates.map {
            let rgb = try RGB(hex: $0)
            return [rgb.r, rgb.g, rgb.b]
        }
        lightBackground = try ThemeBackground(options.backgrounds?["light"] ?? "#ffffff")
        darkBackground = try ThemeBackground(options.backgrounds?["dark"] ?? "#121212")
        self.options = options
        let normalization = options.normalize ?? Normalization()
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
        let digest = try identityDigest(name, namespace: scope, seed: options.seed ?? 0)
        let fractions = identityFractions(digest)
        return try render(hueFraction: fractions[0], lightness: fractions[1], chroma: fractions[2])
    }

    private func render(hueFraction: Double, lightness: Double, chroma: Double) throws -> RenderedPalette {
        let position = hueFraction * 12, slot = Int(position)
        let naturalHue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - Double(slot)))
            .truncatingRemainder(dividingBy: 360)
        let hue = hueDomain.map(naturalHue)
        return try RenderedPalette(hue: hue, light: theme("light", hue, lightness, chroma),
                                   dark: theme("dark", hue, lightness, chroma))
    }

    private func theme(_ name: String, _ hue: Double, _ uL: Double, _ uC: Double) throws -> [String: Color] {
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
            let cap = profile?.chromaCap ?? (fill ? 0.16 : 0.19)
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
        func tone(_ value: Double, _ profile: (l: Double, scale: Double, cap: Double),
                  _ target: Double, _ back: [UInt8]? = nil, _ second: [UInt8]? = nil, surface: Bool = false) -> [UInt8] {
            let l = min(1, max(0, value))
            let c = min(profile.cap, Gamut.sRGB.cusp(lightness: l, hue: hue) * profile.scale)
            let secondary = second == nil ? 0 : required("textOnSubtle")
            let threshold = target == 0 ? secondary : target
            return Gamut.sRGB.repair(lightness: l, chroma: c, hue: hue, target: threshold) { bytes in
                let primary: Double
                if let back { primary = surface ? score(back, bytes) : score(bytes, back) }
                else { primary = score(foreground(bytes, target: target), bytes) }
                guard let second, secondary > 0 else { return primary }
                let secondScore = score(bytes, second)
                return target == 0 ? secondScore : min(primary, secondScore * (target / secondary))
            }.color.bytes
        }
        let subtle = tone(lb + direction * 0.04, fillP, unconstrained)
        let fill = tone(fillP.l, fillP, required("fill")), onFill = foreground(fill, target: required("fill"))
        let roles = [
            "background": bg, "subtle": subtle, "muted": tone(lb + direction * 0.10, fillP, unconstrained),
            "fill": fill, "onFill": onFill,
            "fillHover": tone(fillP.l + direction * 0.025, fillP, required("fillHover"), onFill, surface: true),
            "fillActive": tone(fillP.l + direction * 0.05, fillP, required("fillActive"), onFill, surface: true),
            "border": tone(lb + direction * 0.39, fillP, required("border"), bg),
            "text": tone(textP.l, textP, required("text"), bg, subtle),
            "strong": tone(textP.l + direction * 0.10, textP, required("strong"), bg)
        ]
        return roles.mapValues { Color(rgb: RGB(r: $0[0], g: $0[1], b: $0[2])) }
    }
}
