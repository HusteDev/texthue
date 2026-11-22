package texthue

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"math"
	"unicode/utf8"
)

type BrandPair struct {
	Light string `json:"light,omitempty"`
	Dark  string `json:"dark,omitempty"`
}
type PaletteEntry struct {
	ID string `json:"id"`
	BrandPair
}
type Override BrandPair

func (o *Override) UnmarshalJSON(data []byte) error {
	if len(data) > 0 && data[0] == '"' {
		var value string
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		*o = Override{value, value}
		return nil
	}
	var pair BrandPair
	if err := json.Unmarshal(data, &pair); err != nil {
		return err
	}
	*o = Override(pair)
	return nil
}

type brandEntry struct {
	id      string
	colors  [2]encodedRGB
	passing bool
}
type brandConfig struct {
	overrides map[string][2]encodedRGB
	palette   []brandEntry
}

func compileBrand(raw Options, normal NormalizeOptions, target float64, selectFg func(encodedRGB, float64) encodedRGB) (brandConfig, error) {
	config := brandConfig{overrides: map[string][2]encodedRGB{}}
	parse := func(pair BrandPair) ([2]encodedRGB, error) {
		var colors [2]encodedRGB
		for i, hex := range []string{pair.Light, pair.Dark} {
			rgb, err := background(hex)
			if err != nil {
				return colors, invalid("brand color")
			}
			colors[i] = rgb
		}
		return colors, nil
	}
	for key, pair := range raw.Overrides {
		if !utf8.ValidString(key) {
			return config, invalid("override name")
		}
		name := normal.transform(key)
		if _, ok := config.overrides[name]; ok {
			return config, invalid("duplicate normalized override")
		}
		colors, err := parse(BrandPair(pair))
		if err != nil {
			return config, err
		}
		config.overrides[name] = colors
	}
	if raw.Palette != nil && len(raw.Palette) == 0 {
		return config, invalid("empty palette")
	}
	seen := map[string]bool{}
	for _, item := range raw.Palette {
		if !utf8.ValidString(item.ID) || seen[item.ID] {
			return config, invalid("palette ID")
		}
		seen[item.ID] = true
		pair := item.BrandPair
		if pair.Light == "" {
			pair.Light = pair.Dark
		}
		if pair.Dark == "" {
			pair.Dark = pair.Light
		}
		colors, err := parse(pair)
		if err != nil {
			return config, err
		}
		passing := true
		for _, c := range colors {
			native := canonicalRGB(c, raw.Gamut == "display-p3")
			if raw.score(selectFg(native, target), native) < target {
				passing = false
			}
		}
		config.palette = append(config.palette, brandEntry{item.ID, colors, passing})
	}
	return config, nil
}

func (config brandConfig) selectBrand(name string, digest []byte) (string, *[2]encodedRGB) {
	if fixed, ok := config.overrides[name]; ok {
		return "override", &fixed
	}
	var winner *brandEntry
	var best []byte
	for i := range config.palette {
		item := &config.palette[i]
		hash := sha256.New()
		hash.Write(digest)
		hash.Write([]byte(item.id))
		score := hash.Sum(nil)
		if winner == nil || (item.passing && !winner.passing) || (item.passing == winner.passing && bytes.Compare(score, best) > 0) {
			winner, best = item, score
		}
	}
	if winner != nil {
		return "palette", &winner.colors
	}
	return "", nil
}

func snappedHue(rgb encodedRGB) float64 {
	return math.Mod(math.Floor(formats(rgb).OKLCH.H*1024+.5)/1024, 360)
}

func fixedFraction(rgb encodedRGB) float64 {
	angle := snappedHue(rgb)
	if angle < anchors[0] {
		angle += 360
	}
	for i := 1; i < len(anchors); i++ {
		if anchors[i] > angle {
			return (float64(i-1) + (angle-anchors[i-1])/(anchors[i]-anchors[i-1])) / 12
		}
	}
	panic("angle outside anchored hue range")
}
