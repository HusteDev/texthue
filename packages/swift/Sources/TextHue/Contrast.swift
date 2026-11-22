import Foundation

public enum Gamut {
    case sRGB, displayP3

    var ratioWeights: [Double] {
        switch self {
        case .sRGB: [0.2126, 0.7152, 0.0722]
        case .displayP3: [35783.0/156275, 247089.0/357200, 198249.0/2500400]
        }
    }

    var apcaWeights: [Double] {
        switch self {
        case .sRGB: [0.2126729, 0.7151522, 0.0721750]
        case .displayP3: [0.2289829594805780, 0.6917492625852380, 0.0792677779341829]
        }
    }
}

public enum ContrastModel: String, Decodable {
    case wcag2, apca

    func measure(text: [UInt8], background: [UInt8], gamut: Gamut) -> Double {
        let weights = self == .apca ? gamut.apcaWeights : gamut.ratioWeights
        func luminance(_ rgb: [UInt8]) -> Double {
            precondition(rgb.count == 3)
            var sum = 0.0
            for i in weights.indices {
                let x = Double(rgb[i]) / 255
                let linear: Double
                if self == .apca { linear = pow(x, 2.4) }
                else { linear = linearChannel(x) }
                sum += weights[i] * linear
            }
            return self == .apca && sum < 0.022 ? sum + pow(0.022 - sum, 1.414) : sum
        }
        let fg = luminance(text), bg = luminance(background)
        if self == .wcag2 { return (max(fg, bg) + 0.05) / (min(fg, bg) + 0.05) }
        if abs(fg - bg) < 0.0005 { return 0 }
        let positive = bg > fg
        let raw = 1.14 * (pow(bg, positive ? 0.56 : 0.65) - pow(fg, positive ? 0.57 : 0.62))
        return abs(raw) < 0.1 ? 0 : 100 * (raw - (positive ? 0.027 : -0.027))
    }
}
