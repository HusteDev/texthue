package texthue

import (
	"crypto/sha256"
	"fmt"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"math"
	"regexp"
	"strconv"
	"strings"
)

func ToCSS(c Color, format string) (string, error) {
	decimal := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	switch format {
	case "hex":
		return c.Hex, nil
	case "rgb":
		return fmt.Sprintf("rgb(%d %d %d)", c.RGB.R, c.RGB.G, c.RGB.B), nil
	case "p3":
		if c.P3 != nil {
			return c.CSS, nil
		}
		linear := triple{decode(float64(c.RGB.R) / 255), decode(float64(c.RGB.G) / 255), decode(float64(c.RGB.B) / 255)}
		p3 := multiply(xyzToP3, multiply(rgbToXYZ, linear))
		for i, v := range p3 {
			p3[i] = round6(encode(math.Max(0, math.Min(1, v))))
		}
		return fmt.Sprintf("color(display-p3 %s %s %s)", decimal(p3[0]), decimal(p3[1]), decimal(p3[2])), nil
	case "hsl":
		return fmt.Sprintf("hsl(%s %s%% %s%%)", decimal(c.HSL.H), decimal(c.HSL.S), decimal(c.HSL.L)), nil
	case "oklch":
		return fmt.Sprintf("oklch(%s %s %s)", decimal(c.OKLCH.L), decimal(c.OKLCH.C), decimal(c.OKLCH.H)), nil
	default:
		return "", invalid("CSS format")
	}
}

var cssPrefix = regexp.MustCompile("^[a-z][a-z0-9-]*$")
var slugWhitespace = regexp.MustCompile("[^a-z0-9]+")

func themeColors(colors ColorSet, theme string) (ThemeColors, error) {
	switch theme {
	case "light":
		return colors.Light, nil
	case "dark":
		return colors.Dark, nil
	default:
		return ThemeColors{}, invalid("theme")
	}
}

func (t ThemeColors) roles() map[string]Color {
	return map[string]Color{"background": t.Background, "subtle": t.Subtle, "muted": t.Muted, "fill": t.Fill, "onFill": t.OnFill, "fillHover": t.FillHover, "fillActive": t.FillActive, "border": t.Border, "text": t.Text, "strong": t.Strong}
}

func CSSVariables(colors ColorSet, theme, slug, prefix string) (map[string]string, error) {
	t, err := themeColors(colors, theme)
	if err != nil {
		return nil, err
	}
	if !cssPrefix.MatchString(prefix) {
		return nil, invalid("CSS variable prefix")
	}
	digest := sha256.Sum256([]byte(slug))
	stem := strings.Trim(slugWhitespace.ReplaceAllString(cases.Lower(language.Und).String(slug), "-"), "-")
	if stem == "" {
		stem = "label"
	}
	root := fmt.Sprintf("--%s-%s-%x-", prefix, stem, digest[:3])
	result := map[string]string{}
	for role, c := range t.roles() {
		name := strings.NewReplacer("Hover", "-hover", "Active", "-active", "Fill", "-fill").Replace(role)
		result[root+name] = c.Hex
	}
	return result, nil
}

func (r *Resolver) selectedColor(text, theme, role string, strict bool) (Color, error) {
	name, err := r.identity(text)
	if err != nil {
		return Color{}, err
	}
	index := 0
	switch theme {
	case "light":
	case "dark":
		index = 1
	default:
		return Color{}, invalid("theme")
	}
	if role == "background" {
		if r.wide {
			return rendition(canonicalRGB(r.profiles[index].background, true), true), nil
		}
		return r.bases[index], nil
	}
	colors := r.renderTones(r.digest(name), nil, name, false, index)
	t := colors.Light
	if index == 1 {
		t = colors.Dark
	}
	c, ok := t.roles()[role]
	if !ok {
		return Color{}, invalid("role")
	}
	if strict {
		pairs := map[string][]ContrastResult{
			"fill": {t.Contrast.Fill}, "onFill": {t.Contrast.Fill},
			"fillHover": {t.Contrast.FillHover}, "fillActive": {t.Contrast.FillActive},
			"text":   {t.Contrast.Text, t.Contrast.TextOnSubtle},
			"strong": {t.Contrast.Strong}, "border": {t.Contrast.Border},
		}
		for _, pair := range pairs[role] {
			if !pair.MeetsTarget {
				return Color{}, &Error{Code: "UNMET_CONSTRAINT", Message: theme + "." + role + " contrast target was not met"}
			}
		}
	}
	return c, nil
}
func (r *Resolver) Color(text, theme, role string) (Color, error) {
	return r.selectedColor(text, theme, role, false)
}

// HexStrict returns an error when a contrast requirement for the selected role fails.
func (r *Resolver) HexStrict(text, theme, role string) (string, error) {
	c, err := r.selectedColor(text, theme, role, true)
	return c.Hex, err
}

func (r *Resolver) Hex(text, theme, role string) (string, error) {
	c, err := r.Color(text, theme, role)
	return c.Hex, err
}
