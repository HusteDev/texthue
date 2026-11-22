import Foundation

struct RepairedTone {
    let color: FittedColor
    let score: Double
    var fallback: String?
}

extension Gamut {
    func repair(lightness: Double, chroma: Double, hue: Double, target: Double,
                measure: ([UInt8]) -> Double) -> RepairedTone {
        func evaluate(_ l: Double) -> RepairedTone {
            let color = fit(lightness: l, chroma: chroma, hue: hue)
            return RepairedTone(color: color, score: measure(color.bytes))
        }

        let initial = evaluate(lightness)
        if initial.score >= target { return initial }
        let black = evaluate(0), white = evaluate(1)
        if max(black.score, white.score) < target {
            var best = black.score >= white.score ? black : white
            best.fallback = "unattainable-contrast"
            return best
        }

        var best = initial
        var distance = Double.infinity
        for endpoint in [black, white] where endpoint.score >= target {
            var candidate = endpoint
            var pass = Int(endpoint.color.lightness * 4096)
            var fail = Int(pass == 0 ? ceil(lightness * 4096) : floor(lightness * 4096))
            while abs(pass - fail) > 1 {
                let mid = (pass + fail) / 2
                let probe = evaluate(Double(mid) / 4096)
                if probe.score >= target {
                    candidate = probe
                    pass = mid
                } else {
                    fail = mid
                }
            }
            let delta = abs(candidate.color.lightness - lightness)
            if delta < distance {
                distance = delta
                best = candidate
            }
        }
        return best
    }
}
