package texthue

import (
	"math"
	"slices"
)

// MigrationSide selects a resolver and optionally its stored registry.
type MigrationSide struct {
	Resolver *Resolver
	Registry []byte
}
type FillCollision struct {
	Theme      string   `json:"theme"`
	Hex        string   `json:"hex"`
	Identities []string `json:"identities"`
}
type ColorChange struct {
	Text     string  `json:"text"`
	Theme    string  `json:"theme"`
	Role     string  `json:"role"`
	Before   string  `json:"before"`
	After    string  `json:"after"`
	DeltaE   float64 `json:"deltaE"`
	BeforeP3 string  `json:"beforeP3,omitempty"`
	AfterP3  string  `json:"afterP3,omitempty"`
}
type ContrastChange struct {
	Text         string  `json:"text"`
	Theme        string  `json:"theme"`
	Pair         string  `json:"pair"`
	Before       float64 `json:"before"`
	After        float64 `json:"after"`
	PassedBefore bool    `json:"passedBefore"`
	PassedAfter  bool    `json:"passedAfter"`
}
type MigrationReport struct {
	Moved      []string         `json:"moved"`
	Colors     []ColorChange    `json:"colors"`
	Contrast   []ContrastChange `json:"contrast"`
	Collisions struct {
		Before []FillCollision `json:"before"`
		After  []FillCollision `json:"after"`
	} `json:"collisions"`
}

func (side MigrationSide) snapshot(labels []string) (Collection, []FillCollision, error) {
	if side.Resolver == nil {
		return Collection{}, nil, invalid("migration resolver")
	}
	var pins map[string]Assignment
	if side.Registry != nil {
		var err error
		pins, err = side.Resolver.ImportRegistry(side.Registry)
		if err != nil {
			return Collection{}, nil, err
		}
	}
	collection, err := side.Resolver.Assign(labels, pins)
	if err != nil {
		return Collection{}, nil, err
	}
	collisions := []FillCollision{}
	for _, theme := range []string{"light", "dark"} {
		groups := map[string][]string{}
		seen := map[string]bool{}
		order := []string{}
		for _, text := range labels {
			key := side.Resolver.normalize.transform(text)
			if seen[key] {
				continue
			}
			seen[key] = true
			t, _ := themeColors(collection.Colors[key], theme)
			hex := t.Fill.Hex
			if groups[hex] == nil {
				order = append(order, hex)
			}
			groups[hex] = append(groups[hex], key)
		}
		for _, hex := range order {
			if len(groups[hex]) > 1 {
				collisions = append(collisions, FillCollision{theme, hex, groups[hex]})
			}
		}
	}
	return collection, collisions, nil
}

func colorDistance(x, y OKLCH) float64 {
	ax, ay := x.H*math.Pi/180, y.H*math.Pi/180
	return math.Hypot(x.L-y.L, math.Hypot(x.C*math.Cos(ax)-y.C*math.Cos(ay), x.C*math.Sin(ax)-y.C*math.Sin(ay)))
}

// CompareAssignments previews both configurations over the same complete set.
func CompareAssignments(old, next MigrationSide, texts []string) (MigrationReport, error) {
	labels := slices.Clone(texts)
	slices.Sort(labels)
	labels = slices.Compact(labels)
	report := MigrationReport{Moved: []string{}, Colors: []ColorChange{}, Contrast: []ContrastChange{}}
	left, lc, err := old.snapshot(labels)
	if err != nil {
		return MigrationReport{}, err
	}
	right, rc, err := next.snapshot(labels)
	if err != nil {
		return MigrationReport{}, err
	}
	report.Collisions.Before, report.Collisions.After = lc, rc
	for _, text := range labels {
		a, b := old.Resolver.normalize.transform(text), next.Resolver.normalize.transform(text)
		p, q := left.Assignments[a], right.Assignments[b]
		if a != b || p.HueFraction != q.HueFraction || p.Ring != q.Ring {
			report.Moved = append(report.Moved, text)
		}
		for _, theme := range []string{"light", "dark"} {
			x, _ := themeColors(left.Colors[a], theme)
			y, _ := themeColors(right.Colors[b], theme)
			first, second := x.roles(), y.roles()
			for _, role := range []string{"background", "subtle", "muted", "fill", "onFill", "fillHover", "fillActive", "border", "text", "strong"} {
				f, s := first[role], second[role]
				if f.Hex != s.Hex || f.CSS != s.CSS {
					report.Colors = append(report.Colors, ColorChange{Text: text, Theme: theme, Role: role, Before: f.Hex, After: s.Hex, BeforeP3: f.CSS, AfterP3: s.CSS, DeltaE: colorDistance(f.OKLCH, s.OKLCH)})
				}
			}
			for _, pair := range []struct {
				name string
				f, s ContrastResult
			}{
				{"fill", x.Contrast.Fill, y.Contrast.Fill}, {"fillHover", x.Contrast.FillHover, y.Contrast.FillHover},
				{"fillActive", x.Contrast.FillActive, y.Contrast.FillActive}, {"border", x.Contrast.Border, y.Contrast.Border},
				{"text", x.Contrast.Text, y.Contrast.Text}, {"textOnSubtle", x.Contrast.TextOnSubtle, y.Contrast.TextOnSubtle},
				{"strong", x.Contrast.Strong, y.Contrast.Strong},
			} {
				if pair.f.Ratio != pair.s.Ratio || pair.f.MeetsTarget != pair.s.MeetsTarget {
					report.Contrast = append(report.Contrast, ContrastChange{text, theme, pair.name, pair.f.Ratio, pair.s.Ratio, pair.f.MeetsTarget, pair.s.MeetsTarget})
				}
			}
		}
	}
	return report, nil
}
