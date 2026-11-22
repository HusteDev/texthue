import Foundation

struct FittedColor {
    let bytes: [UInt8]
    let lightness, chroma: Double
}

extension Gamut {
    private static let labToLMS: [[Double]] = [
        [1, 0.3963377773761749, 0.2158037573099136],
        [1, -0.1055613458156586, -0.0638541728258133],
        [1, -0.0894841775298119, -1.2914855480194092],
    ]
    private static let lmsToXYZ: [[Double]] = [
        [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
        [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
        [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
    ]
    private static let xyzToRGB: [[Double]] = [
        [12831 / 3959, -329 / 214, -1974 / 3959],
        [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
        [705 / 12673, -2585 / 12673, 705 / 667],
    ]
    private static let xyzToP3: [[Double]] = [
        [446124 / 178915, -333277 / 357830, -72051 / 178915],
        [-14852 / 17905, 63121 / 35810, 423 / 17905],
        [11844 / 330415, -50337 / 660830, 316169 / 330415],
    ]

    private func linear(_ l: Double, _ c: Double, _ hue: Double) -> [Double] {
        func multiply(_ matrix: [[Double]], _ v: [Double]) -> [Double] {
            matrix.map { row in (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2] }
        }
        let angle = hue * .pi / 180
        let lms = multiply(Self.labToLMS, [l, c * cos(angle), c * sin(angle)])
        let xyz = multiply(Self.lmsToXYZ, lms.map { $0 * $0 * $0 })
        return multiply(self == .sRGB ? Self.xyzToRGB : Self.xyzToP3, xyz)
    }

    private func inside(_ channels: [Double]) -> Bool {
        channels.allSatisfy { $0 >= -1e-12 && $0 <= 1 + 1e-12 }
    }

    private func limit(_ l: Double, _ c: Double, _ h: Double, steps: Int) -> Double {
        var low = 0.0, high = c
        for _ in 0..<steps {
            let mid = (low + high) / 2
            if inside(linear(l, mid, h)) { low = mid } else { high = mid }
        }
        return low
    }

    func cusp(lightness: Double, hue: Double) -> Double {
        lightness == 0 || lightness == 1 ? 0 : limit(lightness, 0.4, hue, steps: 20)
    }

    func fit(lightness l: Double, chroma c: Double, hue h: Double) -> FittedColor {
        if l == 0 || l == 1 {
            return FittedColor(bytes: Array(repeating: UInt8(l * 255), count: 3), lightness: l, chroma: 0)
        }
        var channels = linear(l, c, h)
        var retained = c
        if !inside(channels) {
            retained = limit(l, c, h, steps: 24)
            channels = linear(l, retained, h)
        }
        let bytes = channels.map { value -> UInt8 in
            let x = min(1, max(0, value))
            let encoded = x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1 / 2.4) - 0.055
            return UInt8(floor(encoded * 255 + 0.5))
        }
        return FittedColor(bytes: bytes, lightness: l, chroma: retained)
    }
}
