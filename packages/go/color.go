package texthue

import (
	"fmt"
	"math"
)

// Color conversion, gamut fitting, contrast measurement, and output formatting.
//
// Conversion equations and matrices are taken from W3C CSS Color 4
// (1 September 2026); see THIRD_PARTY_NOTICES.md. The order of floating-point
// operations is part of the text-to-color-v1 contract. Explicit float64
// conversions around products prevent the compiler from fusing them into
// multiply-add instructions, which would change boundary rounding.

// triple holds three numeric channels: linear RGB, XYZ, LMS, or OKLab
// depending on context.
type triple [3]float64

// matrix is a 3x3 row-major conversion matrix.
type matrix [3]triple

// rgb8 holds sRGB channels as integers in 0..255.
type rgb8 [3]int

// Specification matrices M1 through M6. Rational entries are evaluated as
// float64 divisions.
var labToLMS = matrix{{1, .3963377773761749, .2158037573099136}, {1, -.1055613458156586, -.0638541728258133}, {1, -.0894841775298119, -1.2914855480194092}}
var lmsToXYZ = matrix{{1.2268798758459243, -.5578149944602171, .2813910456659647}, {-.0405757452148008, 1.112286803280317, -.0717110580655164}, {-.0763729366746601, -.4214933324022432, 1.5869240198367816}}
var xyzToRGB = matrix{{12831.0 / 3959, -329.0 / 214, -1974.0 / 3959}, {-851781.0 / 878810, 1648619.0 / 878810, 36519.0 / 878810}, {705.0 / 12673, -2585.0 / 12673, 705.0 / 667}}
var rgbToXYZ = matrix{{506752.0 / 1228815, 87881.0 / 245763, 12673.0 / 70218}, {87098.0 / 409605, 175762.0 / 245763, 12673.0 / 175545}, {7918.0 / 409605, 87881.0 / 737289, 1001167.0 / 1053270}}
var xyzToLMS = matrix{{.819022437996703, .3619062600528904, -.1288737815209879}, {.0329836539323885, .9292868615863434, .0361446663506424}, {.0481771893596242, .2642395317527308, .6335478284694309}}
var lmsToLab = matrix{{.210454268309314, .7936177747023054, -.0040720430116193}, {1.9779985324311684, -2.42859224204858, .450593709617411}, {.0259040424655478, .7827717124575296, -.8086757549230774}}

// multiply computes m times v, evaluating each row as (m0*v0 + m1*v1) + m2*v2.
func multiply(m matrix, v triple) (result triple) {
	for i, row := range m {
		result[i] = float64(float64(float64(row[0]*v[0])+float64(row[1]*v[1])) + float64(row[2]*v[2]))
	}
	return
}

// linear converts OKLCH to linear sRGB without clamping. Channels outside
// [0, 1] indicate a color outside the sRGB gamut.
func linear(l, c, h float64) triple {
	angle := float64(h*float64(math.Pi)) / 180
	lms := multiply(labToLMS, triple{l, c * math.Cos(angle), c * math.Sin(angle)})
	for i, x := range lms {
		lms[i] = float64(float64(x*x) * x)
	}
	return multiply(xyzToRGB, multiply(lmsToXYZ, lms))
}

// inside reports whether every linear channel lies within the sRGB gamut,
// allowing 1e-12 of floating-point residue.
func inside(v triple) bool {
	for _, x := range v {
		if x < -1e-12 || x > 1+1e-12 {
			return false
		}
	}
	return true
}

// encode applies the sRGB transfer function from linear light to an encoded channel.
func encode(x float64) float64 {
	if x <= .0031308 {
		return 12.92 * x
	}
	return float64(1.055*math.Pow(x, 1/float64(2.4))) - .055
}

// decode applies the sRGB transfer function from an encoded channel to linear light.
func decode(x float64) float64 {
	if x <= .04045 {
		return x / 12.92
	}
	return math.Pow((x+.055)/1.055, 2.4)
}

// fitted is a gamut-fitted color: final RGB bytes plus the pre-quantization
// lightness and retained chroma.
type fitted struct {
	rgb rgb8
	l   float64
	c   float64
}

// fit brings an OKLCH color into the sRGB gamut and quantizes it to RGB bytes.
//
// Lightness and hue are preserved. Out-of-gamut chroma is reduced with
// exactly 24 binary-search iterations. Lightness 0 and 1 short-circuit to
// black and white. Channels are gamma-encoded, clamped, and rounded half up.
func cusp(l, h float64) float64 {
	if l == 0 || l == 1 {
		return 0
	}
	low, high := 0.0, 0.4
	for i := 0; i < 20; i++ {
		mid := (low + high) / 2
		if inside(linear(l, mid, h)) {
			low = mid
		} else {
			high = mid
		}
	}
	return low
}

func fit(l, c, h float64) fitted {
	if l == 0 || l == 1 {
		channel := int(l * 255)
		return fitted{rgb8{channel, channel, channel}, l, 0}
	}
	retained := c
	v := linear(l, c, h)
	if !inside(v) {
		low, high := 0.0, c
		for i := 0; i < 24; i++ {
			mid := (low + high) / 2
			if inside(linear(l, mid, h)) {
				low = mid
			} else {
				high = mid
			}
		}
		retained = low
		v = linear(l, retained, h)
	}
	var rgb rgb8
	for i, x := range v {
		x = math.Max(0, math.Min(1, x))
		rgb[i] = int(math.Floor(float64(encode(x)*255) + .5))
	}
	return fitted{rgb, l, retained}
}

// luminance computes WCAG relative luminance from RGB bytes.
func luminance(rgb rgb8) float64 {
	r, g, b := decode(float64(rgb[0])/255), decode(float64(rgb[1])/255), decode(float64(rgb[2])/255)
	return float64(float64(float64(.2126*r)+float64(.7152*g)) + float64(.0722*b))
}

// contrast computes the WCAG contrast ratio between two colors, in 1..21.
func contrast(a, b rgb8) float64 {
	x, y := luminance(a), luminance(b)
	return (math.Max(x, y) + .05) / (math.Min(x, y) + .05)
}

// foreground returns black or white, whichever contrasts more with rgb. An
// exact tie selects black.
func foreground(rgb rgb8) rgb8 {
	black, white := rgb8{0, 0, 0}, rgb8{255, 255, 255}
	if contrast(rgb, black) >= contrast(rgb, white) {
		return black
	}
	return white
}

// round6 rounds half up to six decimal places.
func round6(x float64) float64 { return math.Floor(float64(x*1e6)+.5) / 1e6 }

// formats derives every output representation from canonical RGB bytes.
// HSL and OKLCH are rounded to six decimal places, and achromatic colors
// report zero hue and zero chroma.
func formats(rgb rgb8) Color {
	r, g, b := float64(rgb[0])/255, float64(rgb[1])/255, float64(rgb[2])/255
	maximum, minimum := math.Max(r, math.Max(g, b)), math.Min(r, math.Min(g, b))
	delta, light := maximum-minimum, (maximum+minimum)/2
	hue, saturation := 0.0, 0.0
	if delta != 0 {
		saturation = (maximum - light) / math.Min(light, 1-light)
		// Case order (red, green, blue) decides ties between equal maximum channels.
		switch maximum {
		case r:
			hue = (g - b) / delta
			if g < b {
				hue += 6
			}
		case g:
			hue = (b-r)/delta + 2
		default:
			hue = (r-g)/delta + 4
		}
		hue *= 60
	}
	lms := multiply(xyzToLMS, multiply(rgbToXYZ, triple{decode(r), decode(g), decode(b)}))
	for i, value := range lms {
		lms[i] = math.Cbrt(value)
	}
	lab := multiply(lmsToLab, lms)
	chroma, okHue := 0.0, 0.0
	if rgb[0] != rgb[1] || rgb[1] != rgb[2] {
		chroma = math.Sqrt(float64(lab[1]*lab[1]) + float64(lab[2]*lab[2]))
		okHue = math.Mod(math.Mod(float64(math.Atan2(lab[2], lab[1])*180)/float64(math.Pi), 360)+360, 360)
	}
	// A rounded 360 wraps to 0 so hue stays within [0, 360).
	return Color{
		Hex:   fmt.Sprintf("#%02x%02x%02x", rgb[0], rgb[1], rgb[2]),
		RGB:   RGB{rgb[0], rgb[1], rgb[2]},
		HSL:   HSL{math.Mod(round6(hue), 360), round6(saturation * 100), round6(light * 100)},
		OKLCH: OKLCH{round6(lab[0]), round6(chroma), math.Mod(round6(okHue), 360)},
	}
}

// choose selects the final color for one role, enforcing the contrast target.
//
// The sampled color is fitted first. If it fails the target, an text whose
// background cannot reach the target with any sRGB color falls back to the
// better of black and white and reports "unattainable-contrast". Otherwise a
// search over lightness values k/1000 for k = 0..1000 picks the passing
// candidate nearest to the sampled lightness; an exact distance tie chooses
// the lower lightness. Every candidate is fitted from the sampled chroma.
//
// background is the theme background for an text, or nil for a fill, which
// is measured against its own black or white foreground at each step.
//
// choose panics if no candidate passes for a fill; the black and white
// endpoints guarantee this cannot happen for a valid target.
type surfaceConstraint struct {
	rgb    rgb8
	target float64
}

func chooseForeground(l, c, h float64, background *rgb8, target float64, selectColor func(rgb8, float64) rgb8, second ...surfaceConstraint) (rgb8, ContrastResult) {
	measure := func(rgb rgb8) float64 {
		if background != nil {
			ratio := contrast(rgb, *background)
			if len(second) > 0 {
				ratio = math.Min(ratio, contrast(rgb, second[0].rgb)*(target/second[0].target))
			}
			return ratio
		}
		return contrast(rgb, selectColor(rgb, target))
	}
	chosen := fit(l, c, h)
	ratio := measure(chosen.rgb)
	var fallback *string
	if ratio < target {
		if math.Max(measure(rgb8{}), measure(rgb8{255, 255, 255})) < target {
			rgb := rgb8{}
			if measure(rgb8{255, 255, 255}) > measure(rgb) {
				rgb = rgb8{255, 255, 255}
			}
			chosen = fitted{rgb, float64(rgb[0]) / 255, 0}
			ratio = measure(rgb)
			fallback = Ptr("unattainable-contrast")
		} else {
			bestDistance := math.Inf(1)
			for _, endpoint := range []int{0, 4096} {
				pass := endpoint
				fail := int(math.Ceil(l * 4096))
				if endpoint != 0 {
					fail = int(math.Floor(l * 4096))
				}
				candidate := fit(float64(pass)/4096, c, h)
				score := measure(candidate.rgb)
				if score < target {
					continue
				}
				for pass-fail > 1 || fail-pass > 1 {
					mid := (pass + fail) / 2
					probe := fit(float64(mid)/4096, c, h)
					measured := measure(probe.rgb)
					if measured >= target {
						pass, candidate, score = mid, probe, measured
					} else {
						fail = mid
					}
				}
				distance := math.Abs(candidate.l - l)
				if distance < bestDistance {
					chosen, ratio, bestDistance = candidate, score, distance
				}
			}
			if math.IsInf(bestDistance, 1) {
				panic("texthue: contrast search invariant failed")
			}
		}
	}
	return chosen.rgb, ContrastResult{Ratio: ratio, MeetsTarget: ratio >= target,
		LightnessAdjusted: chosen.l != l, ChromaReduced: chosen.c < c, Fallback: fallback}
}

// CompositeOver blends canonical sRGB bytes in linear light over an opaque backdrop.
func CompositeOver(source Color, alpha float64, backdrop Color) (Color, error) {
	if math.IsNaN(alpha) || alpha < 0 || alpha > 1 {
		return Color{}, invalid("alpha")
	}
	front := rgb8{source.RGB.R, source.RGB.G, source.RGB.B}
	back := rgb8{backdrop.RGB.R, backdrop.RGB.G, backdrop.RGB.B}
	var result rgb8
	for i, channel := range front {
		if channel < 0 || channel > 255 || back[i] < 0 || back[i] > 255 {
			return Color{}, invalid("sRGB bytes")
		}
		linear := alpha*decode(float64(channel)/255) + (1-alpha)*decode(float64(back[i])/255)
		result[i] = int(math.Floor(255*encode(linear) + 0.5))
	}
	return formats(result), nil
}

// apcaContrast measures signed APCA-W3 0.1.9 Lc for opaque sRGB, text first.
func apcaContrast(text, background rgb8) float64 {
	luminance := func(rgb rgb8) float64 {
		y := 0.2126729*math.Pow(float64(rgb[0])/255, 2.4) + 0.7151522*math.Pow(float64(rgb[1])/255, 2.4) + 0.0721750*math.Pow(float64(rgb[2])/255, 2.4)
		if y < .022 {
			y += math.Pow(.022-y, 1.414)
		}
		return y
	}
	fg, bg := luminance(text), luminance(background)
	if math.Abs(fg-bg) < .0005 {
		return 0
	}
	backPower, frontPower, offset := .56, .57, .027
	if bg < fg {
		backPower, frontPower, offset = .65, .62, -.027
	}
	raw := 1.14 * (math.Pow(bg, backPower) - math.Pow(fg, frontPower))
	if math.Abs(raw) < .1 {
		return 0
	}
	return 100 * (raw - offset)
}

// MeasureAPCA returns signed APCA Lc for opaque sRGB colors, text first.
func MeasureAPCA(text, background Color) (float64, error) {
	fg := rgb8{text.RGB.R, text.RGB.G, text.RGB.B}
	bg := rgb8{background.RGB.R, background.RGB.G, background.RGB.B}
	for i := range fg {
		if fg[i] < 0 || fg[i] > 255 || bg[i] < 0 || bg[i] > 255 {
			return 0, invalid("sRGB bytes")
		}
	}
	return apcaContrast(fg, bg), nil
}
