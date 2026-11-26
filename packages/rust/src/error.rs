use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextColorError {
    InvalidOptions(&'static str),
    UnmetConstraint(&'static str),
}

impl TextColorError {
    pub const fn code(self) -> &'static str {
        match self {
            Self::InvalidOptions(_) => "INVALID_OPTIONS",
            Self::UnmetConstraint(_) => "UNMET_CONSTRAINT",
        }
    }
}

impl fmt::Display for TextColorError {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidOptions(message) | Self::UnmetConstraint(message) => {
                out.write_str(message)
            }
        }
    }
}

impl std::error::Error for TextColorError {}

impl From<&'static str> for TextColorError {
    fn from(message: &'static str) -> Self {
        Self::InvalidOptions(message)
    }
}
