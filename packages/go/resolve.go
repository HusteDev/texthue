package texthue

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"math"
	"unicode/utf8"
)

// resolvedProfile is a Profile with both ranges present.
type resolvedProfile struct{ l, c Range }

// resolvedTheme holds one theme's parsed background and both role profiles.
type resolvedTheme struct {
	background   rgb8
	fill, accent resolvedProfile
}

// validRange reports whether value is a finite, ordered pair within 0..maximum.
func validRange(value Range, maximum float64) bool {
	return !math.IsNaN(value[0]) && !math.IsNaN(value[1]) && !math.IsInf(value[0], 0) && !math.IsInf(value[1], 0) &&
		value[0] >= 0 && value[0] <= value[1] && value[1] <= maximum
}

// background parses an opaque #RRGGBB string, accepting either hex case.
func background(value string) (rgb8, error) {
	if len(value) != 7 || value[0] != '#' {
		return rgb8{}, invalid("backgrounds")
	}
	bytes, err := hex.DecodeString(value[1:])
	if err != nil {
		return rgb8{}, invalid("backgrounds")
	}
	return rgb8{int(bytes[0]), int(bytes[1]), int(bytes[2])}, nil
}

// applyProfile overwrites result's ranges with any non-nil, valid ranges in
// profile. A nil profile leaves result unchanged.
func applyProfile(profile *Profile, result *resolvedProfile) error {
	if profile == nil {
		return nil
	}
	if profile.Lightness != nil {
		if !validRange(*profile.Lightness, 1) {
			return invalid("lightness")
		}
		result.l = *profile.Lightness
	}
	if profile.Chroma != nil {
		if !validRange(*profile.Chroma, .4) {
			return invalid("chroma")
		}
		result.c = *profile.Chroma
	}
	return nil
}

// resolveOptions validates options and fills in defaults. It returns the
// namespace, contrast target, and the light and dark themes in that order.
// The caller's Options value is not modified.
func resolveOptions(options *Options) (string, float64, [2]resolvedTheme, error) {
	common := Range{.1, .16}
	themes := [2]resolvedTheme{
		{rgb8{255, 255, 255}, resolvedProfile{Range{.72, .82}, common}, resolvedProfile{Range{.45, .55}, common}},
		{rgb8{18, 18, 18}, resolvedProfile{Range{.4, .5}, common}, resolvedProfile{Range{.72, .82}, common}},
	}
	if options == nil {
		return "", 4.5, themes, nil
	}
	if !utf8.ValidString(options.Namespace) || uint64(len(options.Namespace)) > math.MaxUint32 {
		return "", 0, themes, invalid("namespace")
	}
	target := 4.5
	if options.ContrastTarget != nil {
		target = *options.ContrastTarget
		if math.IsNaN(target) || math.IsInf(target, 0) || target < 1 || target > 21 {
			return "", 0, themes, invalid("contrastTarget")
		}
	}
	if options.Backgrounds != nil {
		for i, value := range []*string{options.Backgrounds.Light, options.Backgrounds.Dark} {
			if value == nil {
				continue
			}
			rgb, err := background(*value)
			if err != nil {
				return "", 0, themes, err
			}
			themes[i].background = rgb
		}
	}
	if options.Profiles != nil {
		for i, theme := range []*ThemeProfiles{options.Profiles.Light, options.Profiles.Dark} {
			if theme == nil {
				continue
			}
			if err := applyProfile(theme.Fill, &themes[i].fill); err != nil {
				return "", 0, themes, err
			}
			if err := applyProfile(theme.Accent, &themes[i].accent); err != nil {
				return "", 0, themes, err
			}
		}
	}
	return options.Namespace, target, themes, nil
}

// Resolve maps exact text to coordinated light and dark theme colors.
//
// The text is hashed with SHA-256 together with Version and the namespace,
// and the digest drives hue, lightness, and chroma sampling for four OKLCH
// profiles. Each color is gamut-fitted to sRGB, checked against the contrast
// target, and returned in Hex, RGB, HSL, and OKLCH.
//
// Text is used exactly as given: no trimming, case folding, or Unicode
// normalization is applied. Empty strings and embedded NUL are valid. A nil
// options pointer selects every default.
//
// Resolve returns a *Error with Code "INVALID_TEXT" for text that is not
// valid UTF-8 and "INVALID_OPTIONS" for any invalid option. A contrast target
// that cannot be met is not an error; it is reported in the result's
// ContrastResult metadata. Resolve performs no I/O and retains neither text
// nor options.
func Resolve(text string, options *Options) (ColorSet, error) {
	if !utf8.ValidString(text) {
		return ColorSet{}, &Error{Code: "INVALID_TEXT", Message: "text contains malformed UTF-8"}
	}
	namespace, target, profiles, err := resolveOptions(options)
	if err != nil {
		return ColorSet{}, err
	}
	// Payload: Version, NUL, namespace byte length (uint32 big-endian), namespace, text.
	hash := sha256.New()
	hash.Write([]byte(Version))
	hash.Write([]byte{0})
	var size [4]byte
	binary.BigEndian.PutUint32(size[:], uint32(len(namespace)))
	hash.Write(size[:])
	hash.Write([]byte(namespace))
	hash.Write([]byte(text))
	digest := hash.Sum(nil)
	// The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
	uH := float64(binary.BigEndian.Uint32(digest[0:4])) / 4294967296
	uL := float64(binary.BigEndian.Uint32(digest[4:8])) / 4294967296
	uC := float64(binary.BigEndian.Uint32(digest[8:12])) / 4294967296
	hue := uH * 360
	var themes [2]ThemeColors
	for i, theme := range profiles {
		// Explicit float64 conversions block fused multiply-add so the
		// interpolation rounds exactly as the specification requires.
		fillL := theme.fill.l[0] + float64((theme.fill.l[1]-theme.fill.l[0])*uL)
		fillC := theme.fill.c[0] + float64((theme.fill.c[1]-theme.fill.c[0])*uC)
		accentL := theme.accent.l[0] + float64((theme.accent.l[1]-theme.accent.l[0])*uL)
		accentC := theme.accent.c[0] + float64((theme.accent.c[1]-theme.accent.c[0])*uC)
		// A fill is measured against its own black/white foreground; an accent against the theme background.
		fill, fillMeta := choose(fillL, fillC, hue, nil, target)
		accent, accentMeta := choose(accentL, accentC, hue, &theme.background, target)
		themes[i] = ThemeColors{Background: formats(theme.background), Fill: formats(fill),
			OnFill: formats(foreground(fill)), Accent: formats(accent),
			Contrast: ThemeContrast{Target: target, Fill: fillMeta, Accent: accentMeta}}
	}
	return ColorSet{Version: Version, Hue: hue, Light: themes[0], Dark: themes[1]}, nil
}
