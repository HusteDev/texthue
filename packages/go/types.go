// Package texthue maps exact text to deterministic light and dark theme
// colors using the text-to-color-v1 algorithm. Results match the TextHue
// npm and Python libraries for identical inputs and options.
//
// The package uses only the Go standard library, holds no global mutable
// state, and is safe for concurrent use.
//
//	colors, err := texthue.Resolve("research", nil)
//	if err != nil {
//		return err
//	}
//	fmt.Println(colors.Light.Fill.Hex) // #bf97fc
//	fmt.Println(colors.Dark.Fill.Hex)  // #5f3692
package texthue

import "fmt"

// Version is the algorithm identifier. It is written into every hashed
// payload and returned in ColorSet.Version. It is independent of the module
// release version and changes only when the color mapping itself changes.
const Version = "text-to-color-v1"

// Range is an ordered [minimum, maximum] pair of preferred bounds.
//
// Equal endpoints request a fixed value. Nonzero-width sampling excludes the
// maximum. Contrast enforcement may move lightness outside the range, and
// gamut fitting may reduce chroma below its minimum.
type Range [2]float64

// Profile holds preferred OKLCH lightness and chroma ranges for one color
// role. A nil field keeps its default.
type Profile struct {
	// Lightness bounds, both in 0..1.
	Lightness *Range `json:"lightness,omitempty"`
	// Chroma bounds, both in 0..0.4. {0, 0} requests grayscale.
	Chroma *Range `json:"chroma,omitempty"`
}

// ThemeProfiles holds the profiles for the two color roles of one theme.
type ThemeProfiles struct {
	// Fill is the badge or surface background color.
	Fill *Profile `json:"fill,omitempty"`
	// Accent is the text or mark color used directly on the theme background.
	Accent *Profile `json:"accent,omitempty"`
}

// Profiles holds per-theme profiles.
type Profiles struct {
	Light *ThemeProfiles `json:"light,omitempty"`
	Dark  *ThemeProfiles `json:"dark,omitempty"`
}

// Backgrounds holds theme backgrounds as opaque #RRGGBB strings,
// case-insensitive. Defaults are #ffffff and #121212.
type Backgrounds struct {
	Light *string `json:"light,omitempty"`
	Dark  *string `json:"dark,omitempty"`
}

// Options controls hashing, contrast, and color preferences for Resolve.
//
// A nil *Options selects every default, as does &Options{}. Pointer fields
// distinguish an omitted value from a meaningful zero. Options are never
// modified by this package, but callers must not mutate them concurrently
// with a call.
type Options struct {
	// Namespace is a domain separator mixed into the hash. It is exact
	// Unicode text, not a secret, and must be valid UTF-8.
	Namespace string `json:"namespace,omitempty"`
	// Backgrounds are used for accent contrast measurement.
	Backgrounds *Backgrounds `json:"backgrounds,omitempty"`
	// ContrastTarget is the WCAG ratio required for both pairs in both
	// themes, 1..21 inclusive. Default 4.5.
	ContrastTarget *float64 `json:"contrastTarget,omitempty"`
	// Profiles are per-theme, per-role lightness and chroma preferences.
	Profiles *Profiles `json:"profiles,omitempty"`
}

// Ptr returns a pointer to a copy of value. It is a convenience for filling
// optional Options fields, for example Ptr(7.0) for ContrastTarget.
func Ptr[T any](value T) *T { return &value }

// RGB holds sRGB channels as integers in 0..255.
type RGB struct {
	R int `json:"r"`
	G int `json:"g"`
	B int `json:"b"`
}

// HSL holds hue in degrees [0, 360) and saturation and lightness in percent,
// rounded to six decimal places.
type HSL struct {
	H float64 `json:"h"`
	S float64 `json:"s"`
	L float64 `json:"l"`
}

// OKLCH holds lightness in 0..1, numeric chroma, and hue in degrees [0, 360),
// rounded to six decimal places.
type OKLCH struct {
	L float64 `json:"l"`
	C float64 `json:"c"`
	H float64 `json:"h"`
}

// Color is one opaque sRGB color in four equivalent representations. The RGB
// bytes are canonical; Hex, HSL, and OKLCH are derived from them.
type Color struct {
	// Hex is lowercase six-digit #rrggbb.
	Hex   string `json:"hex"`
	RGB   RGB    `json:"rgb"`
	HSL   HSL    `json:"hsl"`
	OKLCH OKLCH  `json:"oklch"`
}

// ContrastResult reports the measured contrast of one color pair and any
// adjustments made to reach the target.
type ContrastResult struct {
	// Ratio is the WCAG contrast ratio of the final RGB pair, at full precision.
	Ratio float64 `json:"ratio"`
	// MeetsTarget reports whether Ratio is at least the configured target.
	MeetsTarget bool `json:"meetsTarget"`
	// LightnessAdjusted reports whether lightness was moved away from the
	// sampled value to reach the target.
	LightnessAdjusted bool `json:"lightnessAdjusted"`
	// ChromaReduced reports whether chroma was reduced below the requested
	// value to fit the sRGB gamut.
	ChromaReduced bool `json:"chromaReduced"`
	// Fallback is "unattainable-contrast" when no sRGB accent can reach the
	// target against the background; otherwise nil.
	Fallback *string `json:"fallback"`
}

// ThemeContrast holds the configured target and the measurements for both
// contrast pairs of one theme.
type ThemeContrast struct {
	Target float64 `json:"target"`
	// Fill is measured against OnFill.
	Fill ContrastResult `json:"fill"`
	// Accent is measured against Background.
	Accent ContrastResult `json:"accent"`
}

// ThemeColors holds all colors and contrast measurements for one theme.
type ThemeColors struct {
	// Background is the configured theme background.
	Background Color `json:"background"`
	// Fill is the badge or surface color.
	Fill Color `json:"fill"`
	// OnFill is black or white, whichever contrasts more with Fill.
	OnFill Color `json:"onFill"`
	// Accent is the text or mark color for use on Background.
	Accent   Color         `json:"accent"`
	Contrast ThemeContrast `json:"contrast"`
}

// ColorSet is the complete result of Resolve. Its JSON encoding uses the same
// camelCase field names as the other TextHue libraries.
type ColorSet struct {
	// Version is the algorithm identifier that produced this result.
	Version string `json:"version"`
	// Hue is the hash-derived identity hue in degrees, unrounded. All four
	// roles share it before gamut fitting.
	Hue   float64     `json:"hue"`
	Light ThemeColors `json:"light"`
	Dark  ThemeColors `json:"dark"`
}

// Error is returned by Resolve and ParseOptions for invalid input.
//
// Code is stable across the TextHue libraries: "INVALID_TEXT" for malformed
// text or "INVALID_OPTIONS" for any invalid option, including an invalid
// namespace. Message wording is not part of the contract. Use errors.As to
// inspect it.
type Error struct {
	Code    string
	Message string
}

// Error implements the error interface as "CODE: message".
func (e *Error) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

// invalid builds an INVALID_OPTIONS error naming the offending option path.
func invalid(path string) error {
	return &Error{Code: "INVALID_OPTIONS", Message: "invalid option: " + path}
}
