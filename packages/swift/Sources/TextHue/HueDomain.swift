struct HueDomain {
    private let segments: [(Double, Double)]
    private let width: Double

    init(allowed: [Double], excluded: [[Double]]) throws {
        func split(_ arc: [Double]) throws -> [(Double, Double)] {
            guard arc.count == 2, arc.allSatisfy({ (0...360).contains($0) }) else {
                throw RenderError.invalidOptions
            }
            let a = arc[0], b = arc[1]
            return a <= b ? [(a, b)] : [(0, b), (a, 360)]
        }
        guard excluded.count <= 16 else { throw RenderError.invalidOptions }
        var remaining = try split(allowed).filter { $0.0 < $0.1 }
        for arc in excluded {
            for (a, b) in try split(arc) {
                var next: [(Double, Double)] = []
                for (lo, hi) in remaining {
                    if lo < min(hi, a) { next.append((lo, min(hi, a))) }
                    if max(lo, b) < hi { next.append((max(lo, b), hi)) }
                }
                remaining = next
            }
        }
        segments = remaining
        width = remaining.reduce(0) { $0 + $1.1 - $1.0 }
        guard width > 0 else { throw RenderError.invalidOptions }
    }

    func map(_ hue: Double) -> Double {
        if width == 360 { return hue }
        var distance = hue / 360 * width
        for (lo, hi) in segments {
            if distance < hi - lo { return lo + distance }
            distance -= hi - lo
        }
        return segments[0].0
    }
}
