package texthue

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"math"
	"unicode/utf8"
)

// resolvedProfile is a Profile with both ranges present.
type resolvedProfile struct {
	l, c Range
	cap  float64
}

// resolvedTheme holds one theme's parsed background and both role profiles.
type resolvedTheme struct {
	background rgb8
	fill, text resolvedProfile
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
	if profile.ChromaCap != nil {
		cap := *profile.ChromaCap
		if math.IsNaN(cap) || cap < 0 || cap > .4 {
			return invalid("chromaCap")
		}
		result.cap = cap
	}
	if profile.ChromaScale != nil {
		if !validRange(*profile.ChromaScale, 1) {
			return invalid("chroma")
		}
		result.c = *profile.ChromaScale
	}
	return nil
}

// resolveOptions validates options and fills in defaults. It returns the
// namespace, contrast target, and the light and dark themes in that order.
// The caller's Options value is not modified.
func resolveOptions(options *Options) (string, float64, [2]resolvedTheme, error) {
	common := Range{.6, .8}
	themes := [2]resolvedTheme{
		{rgb8{255, 255, 255}, resolvedProfile{Range{.72, .82}, common, .16}, resolvedProfile{Range{.43, .53}, common, .19}},
		{rgb8{18, 18, 18}, resolvedProfile{Range{.4, .5}, common, .16}, resolvedProfile{Range{.72, .82}, common, .19}},
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
	for role, value := range options.ContrastTargets {
		switch role {
		case "fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong":
		default:
			return "", 0, themes, invalid("contrastTargets")
		}
		if math.IsNaN(value) || value < 1 || value > 21 {
			return "", 0, themes, invalid("contrastTargets")
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
			if err := applyProfile(theme.Text, &themes[i].text); err != nil {
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
	if options != nil {
		binary.BigEndian.PutUint32(size[:], options.Seed)
	}
	hash.Write(size[:])
	binary.BigEndian.PutUint32(size[:], uint32(len(namespace)))
	hash.Write(size[:])
	hash.Write([]byte(namespace))
	hash.Write([]byte(text))
	digest := hash.Sum(nil)
	// The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
	uH := float64(binary.BigEndian.Uint32(digest[0:4])) / 4294967296
	uL := float64(binary.BigEndian.Uint32(digest[4:8])) / 4294967296
	uC := float64(binary.BigEndian.Uint32(digest[8:12])) / 4294967296
	position := uH * 12
	index := int(position)
	hue := math.Mod(anchors[index]+float64((anchors[index+1]-anchors[index])*(position-float64(index))), 360)
	required := func(role string) float64 {
		if options != nil {
			if value, ok := options.ContrastTargets[role]; ok {
				return value
			}
		}
		if role == "border" {
			return math.Min(3, target)
		}
		return target
	}
	var themes [2]ThemeColors
	for i, theme := range profiles {
		// Explicit float64 conversions block fused multiply-add so the
		// interpolation rounds exactly as the specification requires.
		fillL := theme.fill.l[0] + float64((theme.fill.l[1]-theme.fill.l[0])*uL)
		fillC := theme.fill.c[0] + float64((theme.fill.c[1]-theme.fill.c[0])*uC)
		textL := theme.text.l[0] + float64((theme.text.l[1]-theme.text.l[0])*uL)
		textC := theme.text.c[0] + float64((theme.text.c[1]-theme.text.c[0])*uC)
		// A fill is measured against its own black/white foreground; an text against the theme background.
		biased := func(l float64, role int) float64 {
			bias := biases[2*i+role]
			segment := int(hue / 30)
			correction := bias[segment] + float64((bias[(segment+1)%12]-bias[segment])*(hue/30-float64(segment)))
			return math.Max(0, math.Min(1, l+correction))
		}
		fillL = biased(fillL, 0)
		textL = biased(textL, 1)
		tone := func(l, scale, cap float64, backdrop *rgb8, required float64, second ...surfaceConstraint) (rgb8, ContrastResult) {
			l = math.Max(0, math.Min(1, l))
			c := cusp(l, hue) * scale
			rgb, meta := choose(l, math.Min(c, cap), hue, backdrop, required, second...)
			meta.ChromaCapped = c > cap
			return rgb, meta
		}
		direction := -1.0
		if i == 1 {
			direction = 1
		}
		base := formats(theme.background)
		lb := math.Round(base.OKLCH.L*4096) / 4096
		subtle, _ := tone(lb+direction*.04, fillC, theme.fill.cap, nil, 1)
		muted, _ := tone(lb+direction*.10, fillC, theme.fill.cap, nil, 1)
		fill, fillMeta := tone(fillL, fillC, theme.fill.cap, nil, required("fill"))
		onFill := foreground(fill)
		hover, hoverMeta := tone(fillL+direction*.025, fillC, theme.fill.cap, &onFill, required("fillHover"))
		active, activeMeta := tone(fillL+direction*.05, fillC, theme.fill.cap, &onFill, required("fillActive"))
		border, borderMeta := tone(lb+direction*.39, fillC, theme.fill.cap, &theme.background, required("border"))
		text, textMeta := tone(textL, textC, theme.text.cap, &theme.background, required("text"), surfaceConstraint{subtle, required("textOnSubtle")})
		strong, strongMeta := tone(textL+direction*.10, textC, theme.text.cap, &theme.background, required("strong"))
		subtleMeta := textMeta
		textMeta.Ratio = contrast(text, theme.background)
		textMeta.MeetsTarget = textMeta.Ratio >= required("text")
		subtleMeta.Ratio = contrast(text, subtle)
		subtleMeta.MeetsTarget = subtleMeta.Ratio >= required("textOnSubtle")
		themes[i] = ThemeColors{Background: base, Subtle: formats(subtle), Muted: formats(muted), Fill: formats(fill),
			OnFill: formats(onFill), FillHover: formats(hover), FillActive: formats(active), Border: formats(border), Text: formats(text), Strong: formats(strong),
			Contrast: ThemeContrast{Target: target, Fill: fillMeta, FillHover: hoverMeta, FillActive: activeMeta, Border: borderMeta, Text: textMeta, TextOnSubtle: subtleMeta, Strong: strongMeta}}

	}
	return ColorSet{Version: Version, HueFraction: uH, Hue: hue, Light: themes[0], Dark: themes[1]}, nil
}
