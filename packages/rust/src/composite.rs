use crate::{contrast::linear_channel, gamut::channel_byte, Color};

/// Composite an sRGB source over an opaque sRGB backdrop in linear light.
pub fn composite_over(
    source: [u8; 3],
    alpha: f64,
    backdrop: [u8; 3],
) -> Result<Color, &'static str> {
    if !(0.0..=1.0).contains(&alpha) {
        return Err("alpha must be finite and between zero and one");
    }
    let rgb = std::array::from_fn(|i| {
        let front = linear_channel(f64::from(source[i]) / 255.0);
        let back = linear_channel(f64::from(backdrop[i]) / 255.0);
        channel_byte(alpha * front + (1.0 - alpha) * back)
    });
    Ok(Color::from(rgb))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct Case {
        source: String,
        alpha: f64,
        backdrop: String,
        expected: String,
    }

    fn rgb(hex: &str) -> [u8; 3] {
        let value = u32::from_str_radix(&hex[1..], 16).unwrap().to_be_bytes();
        [value[1], value[2], value[3]]
    }

    #[test]
    fn shared_composites() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/composite-v1.json")).unwrap();
        for row in cases {
            let result = composite_over(rgb(&row.source), row.alpha, rgb(&row.backdrop)).unwrap();
            assert_eq!(result.hex, row.expected);
        }
        for alpha in [-0.1, 1.1, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(composite_over([0; 3], alpha, [255; 3]).is_err());
        }
    }
}
