import Foundation

struct RoleProfile: Decodable {
    var lightness: [Double]?
    var chromaScale: [Double]?
    var chromaCap: Double?
}

struct RenderOptions: Decodable {
    var contrastTarget: Double?
    var contrastTargets: [String: Double]?
    var backgrounds: [String: String]?
    var profiles: [String: [String: RoleProfile]]?
}

enum RenderError: Error { case invalidOptions }

struct RenderedPalette {
    let hue: Double
    let light, dark: [String: Color]
}

struct Renderer {
    let options: RenderOptions

    func render(hueFraction: Double, lightness: Double, chroma: Double) throws -> RenderedPalette {
        let position = hueFraction * 12, slot = Int(position)
        let hue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - Double(slot)))
            .truncatingRemainder(dividingBy: 360)
        return try RenderedPalette(hue: hue, light: theme("light", hue, lightness, chroma),
                                   dark: theme("dark", hue, lightness, chroma))
    }

    private func theme(_ name: String, _ hue: Double, _ uL: Double, _ uC: Double) throws -> [String: Color] {
        let dark = name == "dark", direction: Double = dark ? 1 : -1
        let raw = options.backgrounds?[name] ?? (dark ? "#121212" : "#ffffff")
        guard raw.first == "#", raw.utf8.count == 7, let n = UInt32(raw.dropFirst(), radix: 16)
        else { throw RenderError.invalidOptions }
        let base = RGB(r: UInt8(n >> 16), g: UInt8((n >> 8) & 255), b: UInt8(n & 255))
        let bg = [base.r, base.g, base.b]
        let lb = floor(Color(rgb: base).oklch.l * 4096 + 0.5) / 4096
        let target = options.contrastTarget ?? 4.5
        func required(_ role: String) -> Double {
            options.contrastTargets?[role] ?? (role == "border" ? min(target, 3) : target)
        }
        func sampled(_ role: String) throws -> (l: Double, scale: Double, cap: Double) {
            let profile = options.profiles?[name]?[role]
            let fill = role == "fill"
            let range = profile?.lightness ?? (dark ? (fill ? [0.4,0.5] : [0.72,0.82]) :
                                                (fill ? [0.72,0.82] : [0.43,0.53]))
            let scale = profile?.chromaScale ?? [0.6,0.8]
            let cap = profile?.chromaCap ?? (fill ? 0.16 : 0.19)
            for pair in [range, scale] {
                guard pair.count == 2, pair[0] >= 0, pair[1] <= 1, pair[0] <= pair[1] else {
                    throw RenderError.invalidOptions
                }
            }
            guard (0...0.4).contains(cap) else { throw RenderError.invalidOptions }
            let bias = biases[(dark ? 2 : 0) + (fill ? 0 : 1)], sector = Int(hue / 30)
            let offset = bias[sector] + (bias[(sector + 1) % 12] - bias[sector]) * (hue / 30 - Double(sector))
            return (min(1, max(0, range[0] + (range[1] - range[0]) * uL + offset)),
                    scale[0] + (scale[1] - scale[0]) * uC, cap)
        }
        let fillP = try sampled("fill"), textP = try sampled("text")
        func ratio(_ a: [UInt8], _ b: [UInt8]) -> Double {
            ContrastModel.wcag2.measure(text: a, background: b, gamut: .sRGB)
        }
        func foreground(_ bytes: [UInt8]) -> [UInt8] {
            let black: [UInt8] = [0,0,0], white: [UInt8] = [255,255,255]
            return ratio(black, bytes) >= ratio(white, bytes) ? black : white
        }
        func tone(_ value: Double, _ profile: (l: Double, scale: Double, cap: Double),
                  _ target: Double, _ back: [UInt8]? = nil, _ second: [UInt8]? = nil) -> [UInt8] {
            let l = min(1, max(0, value))
            let c = min(profile.cap, Gamut.sRGB.cusp(lightness: l, hue: hue) * profile.scale)
            return Gamut.sRGB.repair(lightness: l, chroma: c, hue: hue, target: target) { bytes in
                let primary = ratio(bytes, back ?? foreground(bytes))
                guard let second else { return primary }
                return min(primary, ratio(bytes, second) * (target / required("textOnSubtle")))
            }.color.bytes
        }
        let subtle = tone(lb + direction * 0.04, fillP, 1)
        let fill = tone(fillP.l, fillP, required("fill")), onFill = foreground(fill)
        let roles = [
            "background": bg, "subtle": subtle, "muted": tone(lb + direction * 0.10, fillP, 1),
            "fill": fill, "onFill": onFill,
            "fillHover": tone(fillP.l + direction * 0.025, fillP, required("fillHover"), onFill),
            "fillActive": tone(fillP.l + direction * 0.05, fillP, required("fillActive"), onFill),
            "border": tone(lb + direction * 0.39, fillP, required("border"), bg),
            "text": tone(textP.l, textP, required("text"), bg, subtle),
            "strong": tone(textP.l + direction * 0.10, textP, required("strong"), bg)
        ]
        return roles.mapValues { Color(rgb: RGB(r: $0[0], g: $0[1], b: $0[2])) }
    }
}
