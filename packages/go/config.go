package texthue

import (
	"encoding/json"
	"maps"
	"math"
	"slices"
	"sort"
	"strings"
)

const configSchema = "texthue-config-v1"

// replayInputs preserves validated values whose original representation is
// discarded when compiling the resolver. All mutable fields are copied.
type replayInputs struct {
	namespace, preset, policy string
	seed                      uint32
	hue                       Range
	excludes                  []Range
	foregrounds               []string
	overrides                 map[string]Override
}

func replayFrom(raw Options) replayInputs {
	hue := Range{0, 360}
	if raw.HueRange != nil {
		hue = *raw.HueRange
	}
	return replayInputs{namespace: raw.Namespace, preset: raw.Preset, policy: raw.ForegroundPolicy,
		seed: raw.Seed, hue: hue, excludes: slices.Clone(raw.ExcludeHues),
		foregrounds: slices.Clone(raw.Foregrounds), overrides: maps.Clone(raw.Overrides)}
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func (r *Resolver) expandedOptions() map[string]any {
	v := r.replay
	excludes := append([]Range{}, v.excludes...)
	sort.Slice(excludes, func(i, j int) bool {
		if excludes[i][0] == excludes[j][0] {
			return excludes[i][1] < excludes[j][1]
		}
		return excludes[i][0] < excludes[j][0]
	})
	fg := []string{"#000000", "#ffffff"}
	if v.foregrounds != nil {
		fg = make([]string, len(v.foregrounds))
		for i, c := range v.foregrounds {
			fg[i] = strings.ToLower(c)
		}
	}
	overrides := map[string]Override{}
	for k, pair := range v.overrides {
		overrides[k] = Override{strings.ToLower(pair.Light), strings.ToLower(pair.Dark)}
	}
	profiles := map[string]map[string]Profile{}
	backgrounds := map[string]string{}
	for i, theme := range []string{"light", "dark"} {
		p := r.profiles[i]
		backgrounds[theme] = r.bases[i].Hex
		profiles[theme] = map[string]Profile{}
		for role, profile := range map[string]resolvedProfile{"fill": p.fill, "text": p.text} {
			profiles[theme][role] = Profile{Lightness: &profile.l, ChromaScale: &profile.c, ChromaCap: &profile.cap}
		}
	}
	targets := map[string]float64{}
	for _, role := range []string{"fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong"} {
		target, ok := r.targets[role]
		if !ok {
			target = r.target
			if role == "border" && !r.apca {
				target = math.Min(3, target)
			}
		}
		targets[role] = target
	}
	result := map[string]any{"namespace": v.namespace, "preset": defaultString(v.preset, "labels"),
		"seed": v.seed, "foregroundPolicy": defaultString(v.policy, "best"), "foregrounds": fg,
		"hueRange": v.hue, "excludeHues": excludes, "overrides": overrides, "profiles": profiles,
		"backgrounds": backgrounds, "contrastTarget": r.target, "contrastTargets": targets,
		"normalize": NormalizeOptions{Unicode: defaultString(r.normalize.Unicode, "none"),
			Case: defaultString(r.normalize.Case, "none"), Whitespace: defaultString(r.normalize.Whitespace, "none")}}
	if r.apca {
		result["contrastModel"] = "apca"
	}
	if len(r.brand.palette) > 0 {
		palette := make([]PaletteEntry, 0, len(r.brand.palette))
		for _, e := range r.brand.palette {
			palette = append(palette, PaletteEntry{e.id, BrandPair{formats(e.colors[0]).Hex, formats(e.colors[1]).Hex}})
		}
		sort.Slice(palette, func(i, j int) bool { return palette[i].ID < palette[j].ID })
		result["palette"] = palette
	}
	return result
}

func (r *Resolver) configPayload() (map[string]any, error) {
	encoded, err := json.Marshal(r.expandedOptions())
	if err != nil {
		return nil, err
	}
	var options map[string]any
	if err = json.Unmarshal(encoded, &options); err != nil {
		return nil, err
	}
	return map[string]any{"schema": configSchema, "algorithm": Version, "options": options}, nil
}

// ExportConfig returns an independent JSON snapshot suitable for any TextHue port.
func (r *Resolver) ExportConfig() ([]byte, error) {
	payload, err := r.configPayload()
	if err != nil {
		return nil, err
	}
	sum, err := fingerprint(payload)
	if err != nil {
		return nil, err
	}
	payload["fingerprint"] = sum
	return json.Marshal(payload)
}

// ImportConfig validates the envelope, options and fingerprint before use.
func ImportConfig(data []byte) (*Resolver, error) {
	var saved map[string]any
	if !validJSONUnicode(data) || json.Unmarshal(data, &saved) != nil || len(saved) != 4 ||
		saved["schema"] != configSchema || saved["algorithm"] != Version {
		return nil, invalid("configuration schema or algorithm")
	}
	sum, ok := saved["fingerprint"].(string)
	delete(saved, "fingerprint")
	actual, err := fingerprint(saved)
	if !ok || err != nil || sum != actual {
		return nil, invalid("configuration fingerprint")
	}
	encoded, err := json.Marshal(saved["options"])
	if err != nil {
		return nil, err
	}
	opts, err := ParseOptions(encoded)
	if err != nil {
		return nil, err
	}
	r, err := NewResolver(opts...)
	if err != nil {
		return nil, err
	}
	expanded, err := r.configPayload()
	if err != nil {
		return nil, err
	}
	actual, err = fingerprint(expanded)
	if err != nil || actual != sum {
		return nil, invalid("configuration defaults or fingerprint")
	}
	return r, nil
}
