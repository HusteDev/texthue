import Foundation

public struct Placement: Codable, Equatable, Sendable {
    public let hueFraction: Double
    public let ring: Int64
    public let moved: Bool

    public init(hueFraction: Double, ring: Int64, moved: Bool) {
        self.hueFraction = hueFraction
        self.ring = ring
        self.moved = moved
    }

    static let offsets = [0.0, 0.08, -0.08, 0.16, -0.16]

    static func choose(_ natural: Double, _ occupied: Dictionary<Data, Placement>.Values,
                       _ separation: Double, size: Int) -> Placement {
        if size <= 8 && !occupied.isEmpty {
            var best = -1.0
            var chosen = natural
            for step in 0..<24 {
                let raw = natural + Double(step) / 24
                let hue = raw - floor(raw)
                let distance = occupied.reduce(Double.infinity) { nearest, previous in
                    let delta = abs(previous.hueFraction - hue)
                    return min(nearest, min(delta, 1 - delta))
                }
                if distance > best {
                    best = distance
                    chosen = hue
                }
            }
            return Placement(hueFraction: chosen, ring: 0, moved: chosen != natural)
        }
        var ring: Int64 = 0
        while true {
            let neighbors = occupied.filter { $0.ring == ring }
            for i in 0..<385 {
                let step = (i + 1) / 2 * (i.isMultiple(of: 2) ? 1 : -1)
                let raw = natural + Double(step) * (separation / 4)
                let fraction = raw - floor(raw)
                if neighbors.allSatisfy({ neighbor in
                    let delta = abs(neighbor.hueFraction - fraction)
                    return min(delta, 1 - delta) >= separation
                }) {
                    return Placement(hueFraction: fraction, ring: ring, moved: i != 0 || ring != 0)
                }
            }
            ring += 1
        }
    }
}

public struct Assignment: Sendable {
    public let assignments: [Data: Placement]
    public let colors: [Data: RenderedPalette]
    public let report: AssignmentReport
}

public struct AssignmentReport: Sendable {
    public let minDistance: Double?
    public let closestPairs: [[Data]]
    public let withinRingCapacity: Bool
    public let distinctFills: Bool

    init(fills: [(Data, Color)], size: Int, separation: Double) {
        let points = fills.map { name, fill in
            (name, Color.lab([fill.rgb.r, fill.rgb.g, fill.rgb.b].map { Double($0) / 255 }))
        }
        var minimum: Double?
        var pairs: [[Data]] = []
        for (i, first) in points.enumerated() {
            for second in points.dropFirst(i + 1) {
                let squared = zip(first.1, second.1).reduce(0.0) { sum, values in
                    let delta = values.0 - values.1
                    return sum + delta * delta
                }
                let distance = sqrt(squared)
                if minimum == nil || distance < minimum! {
                    minimum = distance
                    pairs.removeAll(keepingCapacity: true)
                }
                if distance == minimum { pairs.append([first.0, second.0]) }
            }
        }
        minDistance = minimum
        closestPairs = pairs
        withinRingCapacity = size <= Placement.offsets.count * Int(floor(1 / separation))
        distinctFills = Set(fills.map { $0.1.hex }).count == fills.count
    }
}
