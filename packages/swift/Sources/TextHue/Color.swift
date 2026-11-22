import Foundation

public struct RGB: Codable, Equatable {
    public let r, g, b: UInt8
    public init(r: UInt8, g: UInt8, b: UInt8) {
        self.r = r
        self.g = g
        self.b = b
    }
}

public struct HSL: Codable, Equatable { public let h, s, l: Double }
public struct OKLCH: Codable, Equatable { public let l, c, h: Double }

func linearChannel(_ encoded: Double) -> Double {
    encoded <= 0.04045 ? encoded / 12.92 : pow((encoded + 0.055) / 1.055, 2.4)
}

func channelByte(_ linear: Double) -> UInt8 {
    let x = min(1, max(0, linear))
    let encoded = x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1 / 2.4) - 0.055
    return UInt8(floor(encoded * 255 + 0.5))
}

func multiply(_ matrix: [[Double]], _ v: [Double]) -> [Double] {
    matrix.map { row in (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2] }
}

public struct Color: Codable, Equatable {
    public let hex: String
    public let rgb: RGB
    public let hsl: HSL
    public let oklch: OKLCH
    private static let rgbToXYZ: [[Double]] = [
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

    public init(rgb: RGB) {
        func round6(_ value: Double) -> Double { floor(value * 1e6 + 0.5) / 1e6 }
        self.rgb = rgb
        let bytes = [rgb.r, rgb.g, rgb.b]
        hex = "#" + bytes.map { String(format: "%02x", $0) }.joined()
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
        let linear = values.map(linearChannel)
        let xyz = multiply(Self.rgbToXYZ, linear)
        let lab = multiply(Self.lmsToLab, multiply(Self.xyzToLMS, xyz).map { cbrt($0) })
        let neutral = rgb.r == rgb.g && rgb.g == rgb.b
        let angle = atan2(lab[2], lab[1]) * 180 / .pi
        let degrees = (angle + 360).truncatingRemainder(dividingBy: 360)
        oklch = OKLCH(l: round6(lab[0]),
                      c: neutral ? 0 : round6(sqrt(lab[1] * lab[1] + lab[2] * lab[2])),
                      h: neutral ? 0 : round6(degrees).truncatingRemainder(dividingBy: 360))
    }
}
