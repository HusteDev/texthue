import Foundation

public struct RGB: Codable, Equatable, Sendable {
    public let r, g, b: UInt8
    public init(r: UInt8, g: UInt8, b: UInt8) {
        self.r = r
        self.g = g
        self.b = b
    }
}

public struct HSL: Codable, Equatable, Sendable { public let h, s, l: Double }
public struct OKLCH: Codable, Equatable, Sendable { public let l, c, h: Double }

func linearChannel(_ encoded: Double) -> Double {
    encoded <= 0.04045 ? encoded / 12.92 : pow((encoded + 0.055) / 1.055, 2.4)
}

func encodedChannel(_ linear: Double) -> Double {
    let x = min(1, max(0, linear))
    return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1 / 2.4) - 0.055
}

func channelByte(_ linear: Double) -> UInt8 {
    UInt8(floor(encodedChannel(linear) * 255 + 0.5))
}

func multiply(_ matrix: [[Double]], _ v: [Double]) -> [Double] {
    matrix.map { row in (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2] }
}

public struct DisplayP3: Codable, Equatable, Sendable { public let r, g, b: Double }

public enum CSSFormat: Sendable { case hex, rgb, hsl, oklch, displayP3 }

public struct Color: Codable, Equatable, Sendable {
    public let hex: String
    public let rgb: RGB
    public let hsl: HSL
    public let oklch: OKLCH
    public let p3: DisplayP3?
    public let css: String?
    public let srgbClipped: Bool?
    static let rgbToXYZ: [[Double]] = [
        [506752 / 1228815, 87881 / 245763, 12673 / 70218],
        [87098 / 409605, 175762 / 245763, 12673 / 175545],
        [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
    ]
    private static let xyzToLMS: [[Double]] = [
        [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
        [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
        [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
    ]
    private static let lmsToLab: [[Double]] = [
        [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
        [1.9779985324311684, -2.42859224204858, 0.450593709617411],
        [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
    ]

    private static func cssNumber(_ value: Double) -> String {
        var text = String(format: "%.6f", locale: Locale(identifier: "en_US_POSIX"), value)
        while text.last == "0" { text.removeLast() }
        if text.last == "." { text.removeLast() }
        return text == "-0" ? "0" : text
    }

    private static func displayP3CSS(_ channels: [Double]) -> String {
        "color(display-p3 " + channels.map(cssNumber).joined(separator: " ") + ")"
    }

    public func toCSS(_ format: CSSFormat = .hex) -> String {
        switch format {
        case .hex: return hex
        case .rgb: return "rgb(\(rgb.r) \(rgb.g) \(rgb.b))"
        case .hsl: return "hsl(\(Self.cssNumber(hsl.h)) \(Self.cssNumber(hsl.s))% \(Self.cssNumber(hsl.l))%)"
        case .oklch: return "oklch(\(Self.cssNumber(oklch.l)) \(Self.cssNumber(oklch.c)) \(Self.cssNumber(oklch.h)))"
        case .displayP3:
            return css ?? Self.displayP3CSS(Gamut.displayP3.canonicalChannels(sRGB: [rgb.r, rgb.g, rgb.b]).map { $0 / 255 })
        }
    }

    static func hexString(_ bytes: [UInt8]) -> String {
        "#" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    static func lab(_ values: [Double], gamut: Gamut = .sRGB) -> [Double] {
        let linear = values.map(linearChannel)
        let xyz = multiply(gamut == .sRGB ? Self.rgbToXYZ : Gamut.p3ToXYZ, linear)
        return multiply(Self.lmsToLab, multiply(Self.xyzToLMS, xyz).map { cbrt($0) })
    }

    public init(rgb: RGB) {
        self.init(bytes: rgb, gamut: .sRGB)
    }

    public init(bytes native: RGB, gamut: Gamut) {
        self.init(encoded: [native.r, native.g, native.b].map(Double.init), gamut: gamut)
    }

    init(encoded: [Double], gamut: Gamut) {
        func round6(_ value: Double) -> Double { floor(value * 1e6 + 0.5) / 1e6 }
        let nativeValues = encoded.map { $0 / 255 }
        if gamut == .displayP3 {
            let fallback = Gamut.p3Fallback(encoded: encoded)
            rgb = fallback.rgb
            srgbClipped = fallback.clipped
            let channels = nativeValues.map(round6)
            p3 = DisplayP3(r: channels[0], g: channels[1], b: channels[2])
            css = Self.displayP3CSS(channels)
        } else {
            rgb = RGB(r: UInt8(encoded[0]), g: UInt8(encoded[1]), b: UInt8(encoded[2]))
            srgbClipped = nil
            p3 = nil
            css = nil
        }
        let bytes = [rgb.r, rgb.g, rgb.b]
        hex = Self.hexString(bytes)
        let values = bytes.map { Double($0) / 255 }
        let r = values[0], g = values[1], b = values[2]
        let hi = max(r, g, b), lo = min(r, g, b)
        let delta = hi - lo, light = (hi + lo) / 2
        var hue = 0.0, saturation = 0.0
        if delta != 0 {
            saturation = (hi - light) / min(light, 1 - light)
            if hi == r { hue = (g - b) / delta + (g < b ? 6 : 0) }
            else if hi == g { hue = (b - r) / delta + 2 }
            else { hue = (r - g) / delta + 4 }
        }
        hsl = HSL(h: round6(60 * hue).truncatingRemainder(dividingBy: 360),
                  s: round6(saturation * 100), l: round6(light * 100))
        let lab = Self.lab(nativeValues, gamut: gamut)
        let neutral = encoded[0] == encoded[1] && encoded[1] == encoded[2]
        let angle = atan2(lab[2], lab[1]) * 180 / .pi
        let degrees = (angle + 360).truncatingRemainder(dividingBy: 360)
        oklch = OKLCH(l: round6(lab[0]),
                      c: neutral ? 0 : round6(sqrt(lab[1] * lab[1] + lab[2] * lab[2])),
                      h: neutral ? 0 : round6(degrees).truncatingRemainder(dividingBy: 360))
    }
}
