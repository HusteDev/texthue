mod color;
pub use color::{Color, Hsl, Oklch};
mod repair;
pub use repair::RepairedTone;
mod gamut;
pub use gamut::{p3_fallback, FittedColor};
mod contrast;
pub use contrast::{ContrastModel, Gamut};

use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Copy, Debug, Default)]
pub enum UnicodeForm {
    #[default]
    Exact,
    Nfc,
    Nfkc,
}

#[derive(Clone, Copy, Debug, Default)]
pub enum Whitespace {
    #[default]
    Exact,
    Trim,
    Collapse,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Normalization {
    pub unicode: UnicodeForm,
    pub lowercase: bool,
    pub whitespace: Whitespace,
}

impl Normalization {
    pub fn apply(self, input: &str) -> String {
        let mut text: String = match self.unicode {
            UnicodeForm::Exact => input.to_owned(),
            UnicodeForm::Nfc => input.nfc().collect(),
            UnicodeForm::Nfkc => input.nfkc().collect(),
        };
        if self.lowercase {
            text = text.to_lowercase();
        }
        match self.whitespace {
            Whitespace::Exact => text,
            Whitespace::Trim => text.trim().to_owned(),
            Whitespace::Collapse => text.split_whitespace().collect::<Vec<_>>().join(" "),
        }
    }
}

/// Hash a normalized label and namespace. The namespace byte length must fit in a u32.
pub fn identity_digest(
    text: &str,
    namespace: &str,
    seed: u32,
) -> Result<[u8; 32], std::num::TryFromIntError> {
    let length = u32::try_from(namespace.len())?;
    let mut hash = Sha256::new();
    hash.update(b"text-to-color-v1\0");
    hash.update(seed.to_be_bytes());
    hash.update(length.to_be_bytes());
    hash.update(namespace.as_bytes());
    hash.update(text.as_bytes());
    Ok(hash.finalize().into())
}

pub fn identity_fractions(digest: &[u8; 32]) -> [f64; 3] {
    std::array::from_fn(|i| {
        let offset = i * 4;
        let word = u32::from_be_bytes(digest[offset..offset + 4].try_into().unwrap());
        f64::from(word) / 4294967296.0
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn hex(bytes: [u8; 32]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn shared_identities() {
        #[derive(serde::Deserialize)]
        struct Corpus {
            vectors: Vec<Value>,
        }
        let corpus: Corpus =
            serde_json::from_str(include_str!("../../../conformance/vectors.json")).unwrap();
        let rows = corpus.vectors;
        assert_eq!(rows.len(), 32);
        for row in rows {
            let options = &row["options"];
            let digest = identity_digest(
                row["text"].as_str().unwrap(),
                options["namespace"].as_str().unwrap_or(""),
                options["seed"].as_u64().unwrap_or(0).try_into().unwrap(),
            )
            .unwrap();
            assert_eq!(hex(digest), row["encoding"]["sha256"]);
            for (actual, expected) in identity_fractions(&digest)
                .iter()
                .zip(row["fractions"].as_array().unwrap())
            {
                assert_eq!(*actual, expected.as_f64().unwrap());
            }
        }
    }

    #[test]
    fn shared_normalization() {
        let rows: Vec<Value> =
            serde_json::from_str(include_str!("../../../conformance/normalization-v1.json"))
                .unwrap();
        assert_eq!(rows.len(), 90);
        for row in rows {
            let opts = &row["normalize"];
            let policy = Normalization {
                unicode: match opts["unicode"].as_str().unwrap() {
                    "none" => UnicodeForm::Exact,
                    "NFC" => UnicodeForm::Nfc,
                    "NFKC" => UnicodeForm::Nfkc,
                    _ => panic!("invalid form"),
                },
                lowercase: opts["case"] == "lower",
                whitespace: match opts["whitespace"].as_str().unwrap() {
                    "none" => Whitespace::Exact,
                    "trim" => Whitespace::Trim,
                    "collapse" => Whitespace::Collapse,
                    _ => panic!("invalid whitespace"),
                },
            };
            let digest = identity_digest(
                &policy.apply(row["text"].as_str().unwrap()),
                &policy.apply(row["namespace"].as_str().unwrap()),
                row["seed"].as_u64().unwrap().try_into().unwrap(),
            )
            .unwrap();
            assert_eq!(hex(digest), row["digest"]);
        }
    }
}
