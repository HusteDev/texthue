package texthue

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
	"maps"
	"math"
	"slices"
	"strings"
	"unicode/utf8"
)

// resolvedProfile is a Profile with both ranges present.
type resolvedProfile struct {
	l, c Range
	cap  float64
}

// resolvedTheme holds one theme's parsed background and both role profiles.
type resolvedTheme struct {
	background encodedRGB
	fill, text resolvedProfile
}

// validRange reports whether value is a finite, ordered pair within 0..maximum.
func validRange(value Range, maximum float64) bool {
	return !math.IsNaN(value[0]) && !math.IsNaN(value[1]) && !math.IsInf(value[0], 0) && !math.IsInf(value[1], 0) &&
		value[0] >= 0 && value[0] <= value[1] && value[1] <= maximum
}

// background parses an opaque #RRGGBB string, accepting either hex case.
func background(value string) (encodedRGB, error) {
	if len(value) != 7 || value[0] != '#' {
		return encodedRGB{}, invalid("backgrounds")
	}
	bytes, err := hex.DecodeString(value[1:])
	if err != nil {
		return encodedRGB{}, invalid("backgrounds")
	}
	return encodedRGB{float64(bytes[0]), float64(bytes[1]), float64(bytes[2])}, nil
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
	target := 4.5
	if options != nil {
		switch options.Preset {
		case "", "labels":
		case "controls":
			target = 7
		case "mono":
			common = Range{0, 0}
		case "subdued":
			common = Range{.2, .4}
		case "chart":
			common = Range{.8, 1}
		default:
			return "", 0, [2]resolvedTheme{}, invalid("preset")
		}
	}
	themes := [2]resolvedTheme{
		{encodedRGB{255, 255, 255}, resolvedProfile{Range{.72, .82}, common, .16}, resolvedProfile{Range{.43, .53}, common, .19}},
		{encodedRGB{18, 18, 18}, resolvedProfile{Range{.4, .5}, common, .16}, resolvedProfile{Range{.72, .82}, common, .19}},
	}
	if options == nil {
		return "", 4.5, themes, nil
	}
	if !utf8.ValidString(options.Namespace) || uint64(len(options.Namespace)) > math.MaxUint32 {
		return "", 0, themes, invalid("namespace")
	}
	low, high := 1.0, 21.0
	switch options.ContrastModel {
	case "", "wcag2":
	case "apca":
		target, low, high = 60, 0, 106
	default:
		return "", 0, themes, invalid("contrastModel")
	}
	if options.ContrastTarget != nil {
		target = *options.ContrastTarget
		if math.IsNaN(target) || math.IsInf(target, 0) || target < low || target > high {
			return "", 0, themes, invalid("contrastTarget")
		}
	}
	for role, value := range options.ContrastTargets {
		switch role {
		case "fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong":
		default:
			return "", 0, themes, invalid("contrastTargets")
		}
		if math.IsNaN(value) || value < low || value > high {
			return "", 0, themes, invalid("contrastTargets")
		}
	}
	if n := options.Normalize; n != nil {
		if n.Unicode != "" && n.Unicode != "none" && n.Unicode != "NFC" && n.Unicode != "NFKC" {
			return "", 0, themes, invalid("normalize.unicode")
		}
		if n.Case != "" && n.Case != "none" && n.Case != "lower" {
			return "", 0, themes, invalid("normalize.case")
		}
		if n.Whitespace != "" && n.Whitespace != "none" && n.Whitespace != "trim" && n.Whitespace != "collapse" {
			return "", 0, themes, invalid("normalize.whitespace")
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
func Resolve(text string, options ...Option) (ColorSet, error) {
	if !utf8.ValidString(text) {
		return ColorSet{}, &Error{Code: "INVALID_TEXT", Message: "text contains malformed UTF-8"}
	}
	resolver, err := NewResolver(options...)
	if err != nil {
		return ColorSet{}, err
	}
	return resolver.Resolve(text)
}

// Option configures a resolver before its validated settings are captured.
type Option interface{ apply(*Options) }
type optionFunc func(*Options)

func (f optionFunc) apply(dst *Options) { f(dst) }
func (src *Options) apply(dst *Options) {
	if src != nil {
		*dst = *src
	}
}
func WithNamespace(value string) Option { return optionFunc(func(o *Options) { o.Namespace = value }) }
func WithPreset(value string) Option    { return optionFunc(func(o *Options) { o.Preset = value }) }
func WithSeed(value uint32) Option      { return optionFunc(func(o *Options) { o.Seed = value }) }
func WithGamut(gamut string) Option     { return optionFunc(func(o *Options) { o.Gamut = gamut }) }
func WithContrastModel(model string) Option {
	return optionFunc(func(o *Options) { o.ContrastModel = model })
}
func WithContrastTarget(value float64) Option {
	return optionFunc(func(o *Options) { o.ContrastTarget = &value })
}
func WithBackgrounds(light, dark string) Option {
	return optionFunc(func(o *Options) { o.Backgrounds = &Backgrounds{Light: &light, Dark: &dark} })
}
func WithProfile(value Profiles) Option { return optionFunc(func(o *Options) { o.Profiles = &value }) }

// WithOverrides pins normalized labels to supplied brand colors.
func WithOverrides(values map[string]Override) Option {
	snapshot := maps.Clone(values)
	return optionFunc(func(o *Options) { o.Overrides = maps.Clone(snapshot) })
}

// WithPalette restricts brand selection to the supplied palette entries.
func WithPalette(values []PaletteEntry) Option {
	snapshot := slices.Clone(values)
	return optionFunc(func(o *Options) { o.Palette = slices.Clone(snapshot) })
}

func WithNormalize(value NormalizeOptions) Option {
	return optionFunc(func(o *Options) { o.Normalize = &value })
}

func (n NormalizeOptions) transform(text string) string {
	switch n.Unicode {
	case "NFC":
		text = norm.NFC.String(text)
	case "NFKC":
		text = norm.NFKC.String(text)
	}
	if n.Case == "lower" {
		text = cases.Lower(language.Und).String(text)
	}
	switch n.Whitespace {
	case "trim":
		text = strings.TrimSpace(text)
	case "collapse":
		text = strings.Join(strings.Fields(text), " ")
	}
	return text
}

func compileForegrounds(options Options) (func(encodedRGB, float64) encodedRGB, error) {
	values := options.Foregrounds
	if values == nil {
		values = []string{"#000000", "#ffffff"}
	}
	if len(values) == 0 || (options.ForegroundPolicy != "" && options.ForegroundPolicy != "best" && options.ForegroundPolicy != "first-passing") {
		return nil, invalid("foregrounds")
	}
	colors := make([]encodedRGB, len(values))
	for i, hex := range values {
		color, err := background(hex)
		if err != nil {
			return nil, invalid("foregrounds")
		}
		colors[i] = canonicalRGB(color, options.Gamut == "display-p3")
	}
	first := options.ForegroundPolicy == "first-passing"
	return func(rgb encodedRGB, target float64) encodedRGB {
		selected, best := colors[0], -1.0
		for _, candidate := range colors {
			ratio := options.score(candidate, rgb)
			if first && ratio >= target {
				return candidate
			}
			if ratio > best {
				selected, best = candidate, ratio
			}
		}
		return selected
	}, nil
}

type Resolver struct {
	wide             bool
	apca             bool
	replay           replayInputs
	brand            brandConfig
	selectForeground func(encodedRGB, float64) encodedRGB
	domain           hueDomain
	normalize        NormalizeOptions
	prefix           []byte
	target           float64
	targets          map[string]float64
	profiles         [2]resolvedTheme
	bases            [2]Color
}

func NewResolver(options ...Option) (*Resolver, error) {
	var raw Options
	for _, option := range options {
		if option != nil {
			option.apply(&raw)
		}
	}
	namespace, target, profiles, err := resolveOptions(&raw)
	if err != nil {
		return nil, err
	}
	if raw.Gamut != "" && raw.Gamut != "srgb" && raw.Gamut != "display-p3" {
		return nil, invalid("gamut")
	}
	wide := raw.Gamut == "display-p3"
	selectForeground, err := compileForegrounds(raw)
	if err != nil {
		return nil, err
	}
	domain, err := compileHueDomain(raw.HueRange, raw.ExcludeHues)
	if err != nil {
		return nil, err
	}
	var normalization NormalizeOptions
	if raw.Normalize != nil {
		normalization = *raw.Normalize
	}
	fillTarget := target
	if value, ok := raw.ContrastTargets["fill"]; ok {
		fillTarget = value
	}
	brand, err := compileBrand(raw, normalization, fillTarget, selectForeground)
	if err != nil {
		return nil, err
	}
	namespace = normalization.transform(namespace)
	if uint64(len(namespace)) > math.MaxUint32 {
		return nil, invalid("namespace")
	}
	prefix := append([]byte(Version), 0)
	prefix = binary.BigEndian.AppendUint32(prefix, raw.Seed)
	prefix = binary.BigEndian.AppendUint32(prefix, uint32(len(namespace)))
	prefix = append(prefix, namespace...)
	return &Resolver{wide: wide, apca: raw.ContrastModel == "apca", replay: replayFrom(raw), brand: brand, selectForeground: selectForeground, domain: domain, normalize: normalization, prefix: prefix, target: target, targets: maps.Clone(raw.ContrastTargets), profiles: profiles,
		bases: [2]Color{rendition(canonicalRGB(profiles[0].background, wide), wide), rendition(canonicalRGB(profiles[1].background, wide), wide)}}, nil
}

func (r *Resolver) Batch(texts []string) ([]ColorSet, error) {
	result := make([]ColorSet, len(texts))
	seen := make(map[string]ColorSet)
	for i, text := range texts {
		name, err := r.identity(text)
		if err != nil {
			return nil, err
		}
		value, ok := seen[name]
		if !ok {
			value = r.renderTones(r.digest(name), nil, name, false, -1)
			seen[name] = value
		} else {
			value = value.detached()
		}
		result[i] = value
	}
	return result, nil
}

func (r *Resolver) Resolve(text string) (ColorSet, error) {
	return r.resolve(text, false)
}

// ResolveWithTrace includes the requested, biased, repaired and gamut-fitted tone coordinates.
func (r *Resolver) ResolveWithTrace(text string) (ColorSet, error) {
	return r.resolve(text, true)
}

func (r *Resolver) resolve(text string, trace bool) (ColorSet, error) {
	name, err := r.identity(text)
	if err != nil {
		return ColorSet{}, err
	}
	return r.renderTones(r.digest(name), nil, name, trace, -1), nil
}

func (r *Resolver) identity(text string) (string, error) {
	if !utf8.ValidString(text) {
		return "", &Error{Code: "INVALID_TEXT", Message: "text contains malformed UTF-8"}
	}
	return r.normalize.transform(text), nil
}

func (r *Resolver) digest(normalized string) []byte {
	hash := sha256.New()
	hash.Write(r.prefix)
	hash.Write([]byte(normalized))
	return hash.Sum(nil)
}

func (r *Resolver) render(digest []byte, placement *Assignment, name string) ColorSet {
	return r.renderTones(digest, placement, name, false, -1)
}

func (r *Resolver) renderTones(digest []byte, placement *Assignment, name string, trace bool, onlyTheme int) ColorSet {
	target := r.target
	// The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
	uH := float64(binary.BigEndian.Uint32(digest[0:4])) / 4294967296
	uL := float64(binary.BigEndian.Uint32(digest[4:8])) / 4294967296
	uC := float64(binary.BigEndian.Uint32(digest[8:12])) / 4294967296
	ring := 0
	if placement != nil {
		uH = placement.HueFraction
		ring = placement.Ring % 5
	}
	offset := [5]float64{0, .08, -.08, .16, -.16}[ring]
	position := uH * 12
	index := int(position)
	hue := math.Mod(anchors[index]+float64((anchors[index+1]-anchors[index])*(position-float64(index))), 360)
	hue = r.domain.mapHue(hue)
	required := func(role string) float64 {
		if value, ok := r.targets[role]; ok {
			return value
		}
		if role == "border" && !r.apca {
			return math.Min(3, target)
		}
		return target
	}
	naturalHue := hue
	source, brand := r.brand.selectBrand(name, digest)
	if brand != nil {
		uL, uC = .5, .5
	} else if placement != nil {
		source = "assigned"
	} else {
		source = "hash"
	}
	var themes [2]ThemeColors
	for i, theme := range r.profiles {
		if onlyTheme >= 0 && i != onlyTheme {
			continue
		}
		hue = naturalHue
		if brand != nil {
			hue = snappedHue(brand[i])
		}
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
			return math.Max(0, math.Min(1, l+correction+offset))
		}
		if ring >= 3 {
			fillC *= .6
			textC *= .6
		}
		requestedFill, requestedText := fillL, textL
		fillL = biased(fillL, 0)
		textL = biased(textL, 1)
		if brand != nil {
			fixed := formats(brand[i]).OKLCH
			fillL = math.Round(fixed.L*4096) / 4096
			requestedFill = fillL
			if fixed.C == 0 {
				theme.fill.cap = 0
				theme.text.cap = 0
			}
		}
		theme.background = canonicalRGB(theme.background, r.wide)
		m := xyzToRGB
		if r.wide {
			m = xyzToP3
		}
		ratioMetric := contrastMetric(false, r.wide)
		metric := contrastMetric(r.apca, r.wide)
		display := func(rgb encodedRGB) Color { return rendition(rgb, r.wide) }
		var traces struct{ Subtle, Muted, Fill, FillHover, FillActive, Border, Text, Strong *ToneTrace }
		tone := func(out **ToneTrace, requested, l, scale, cap float64, backdrop *encodedRGB, required float64, surface bool, second ...surfaceConstraint) (encodedRGB, ContrastResult) {
			l = math.Max(0, math.Min(1, l))
			c := cuspIn(l, hue, m) * scale
			chosen, meta := chooseForeground(l, math.Min(c, cap), hue, backdrop, required, r.selectForeground, r.apca, surface, r.wide, second...)
			meta.ChromaCapped = c > cap
			if trace {
				requested = math.Max(0, math.Min(1, requested))
				capped := math.Min(c, cap)
				*out = &ToneTrace{Source: "generated", Requested: &OKLCH{requested, cuspIn(requested, hue, m) * scale, hue}, Biased: &OKLCH{l, capped, hue}, Repaired: &OKLCH{chosen.l, capped, hue}, Fitted: &OKLCH{chosen.l, chosen.c, hue}}
			}
			return chosen.rgb, meta
		}
		direction := -1.0
		if i == 1 {
			direction = 1
		}
		base := r.bases[i]
		if r.wide {
			base = display(theme.background)
		}
		lb := math.Round(base.OKLCH.L*4096) / 4096
		unconstrained := 1.0
		if r.apca {
			unconstrained = 0
		}
		subtle, _ := tone(&traces.Subtle, lb+direction*.04, lb+direction*.04, fillC, theme.fill.cap, nil, unconstrained, true)
		muted, _ := tone(&traces.Muted, lb+direction*.10, lb+direction*.10, fillC, theme.fill.cap, nil, unconstrained, true)
		fill, fillMeta := tone(&traces.Fill, requestedFill, fillL, fillC, theme.fill.cap, nil, required("fill"), true)
		if brand != nil {
			fill = canonicalRGB(brand[i], r.wide)
		}
		onFill := r.selectForeground(fill, required("fill"))
		if brand != nil {
			ratio := ratioMetric(fill, onFill)
			if r.apca {
				ratio = math.Abs(metric(onFill, fill))
			}
			fillMeta = ContrastResult{Ratio: ratio, MeetsTarget: ratio >= required("fill")}
			if !fillMeta.MeetsTarget {
				fillMeta.Fallback = ptr("palette-constraint")
			}
		}
		hover, hoverMeta := tone(&traces.FillHover, requestedFill+direction*.025, fillL+direction*.025, fillC, theme.fill.cap, &onFill, required("fillHover"), true)
		active, activeMeta := tone(&traces.FillActive, requestedFill+direction*.05, fillL+direction*.05, fillC, theme.fill.cap, &onFill, required("fillActive"), true)
		border, borderMeta := tone(&traces.Border, lb+direction*.39, lb+direction*.39, fillC, theme.fill.cap, &theme.background, required("border"), false)
		text, textMeta := tone(&traces.Text, requestedText, textL, textC, theme.text.cap, &theme.background, required("text"), false, surfaceConstraint{subtle, required("textOnSubtle")})
		strong, strongMeta := tone(&traces.Strong, requestedText+direction*.10, textL+direction*.10, textC, theme.text.cap, &theme.background, required("strong"), false)
		subtleMeta := textMeta
		textMeta.Ratio = ratioMetric(text, theme.background)
		textMeta.MeetsTarget = textMeta.Ratio >= required("text")
		subtleMeta.Ratio = ratioMetric(text, subtle)
		subtleMeta.MeetsTarget = subtleMeta.Ratio >= required("textOnSubtle")
		if r.apca {
			record := func(meta *ContrastResult, role string, front, back encodedRGB) {
				value := metric(front, back)
				meta.Model = "apca"
				meta.Value = &value
				meta.Ratio = ratioMetric(front, back)
				meta.MeetsTarget = math.Abs(value) >= required(role)
			}
			record(&fillMeta, "fill", onFill, fill)
			record(&hoverMeta, "fillHover", onFill, hover)
			record(&activeMeta, "fillActive", onFill, active)
			record(&textMeta, "text", text, theme.background)
			record(&subtleMeta, "textOnSubtle", text, subtle)
			record(&borderMeta, "border", border, theme.background)
			record(&strongMeta, "strong", strong, theme.background)
		}
		themes[i] = ThemeColors{Background: base, Subtle: display(subtle), Muted: display(muted), Fill: display(fill),
			OnFill: display(onFill), FillHover: display(hover), FillActive: display(active), Border: display(border), Text: display(text), Strong: display(strong),
			Contrast: ThemeContrast{Target: target, Fill: fillMeta, FillHover: hoverMeta, FillActive: activeMeta, Border: borderMeta, Text: textMeta, TextOnSubtle: subtleMeta, Strong: strongMeta}}
		if trace {
			t := &themes[i]
			t.Background.Trace = &ToneTrace{Source: "supplied", Hex: t.Background.Hex}
			t.OnFill.Trace = &ToneTrace{Source: "supplied", Hex: t.OnFill.Hex}
			t.Fill.Trace = traces.Fill
			if brand != nil {
				t.Fill.Trace = &ToneTrace{Source: "supplied", Hex: t.Fill.Hex}
			}
			t.Subtle.Trace = traces.Subtle
			t.Muted.Trace = traces.Muted
			t.FillHover.Trace = traces.FillHover
			t.FillActive.Trace = traces.FillActive
			t.Border.Trace = traces.Border
			t.Text.Trace = traces.Text
			t.Strong.Trace = traces.Strong
		}

	}
	if brand != nil {
		hue = snappedHue(brand[0])
		uH = fixedFraction(brand[0])
	}
	return ColorSet{Source: source, Version: Version, HueFraction: uH, Hue: hue, Light: themes[0], Dark: themes[1]}
}

// WithColorBackgrounds uses the hex renditions of two opaque colors as theme backgrounds.
func WithColorBackgrounds(light, dark Color) Option { return WithBackgrounds(light.Hex, dark.Hex) }

func (o Options) score(text, bg encodedRGB) float64 {
	return math.Abs(contrastMetric(o.ContrastModel == "apca", o.Gamut == "display-p3")(text, bg))
}
