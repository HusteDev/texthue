public enum CompositingError: Error { case invalidAlpha }

/// Composites an sRGB source over an opaque backdrop in linear light.
public func compositeOver(_ source: Color, alpha: Double, backdrop: Color) throws -> Color {
    guard (0...1).contains(alpha) else { throw CompositingError.invalidAlpha }
    func blend(_ front: UInt8, _ back: UInt8) -> UInt8 {
        let a = linearChannel(Double(front) / 255)
        let b = linearChannel(Double(back) / 255)
        return channelByte(alpha * a + (1 - alpha) * b)
    }
    return Color(rgb: RGB(r: blend(source.rgb.r, backdrop.rgb.r),
                          g: blend(source.rgb.g, backdrop.rgb.g),
                          b: blend(source.rgb.b, backdrop.rgb.b)))
}
