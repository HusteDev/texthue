package texthue

import (
	"encoding/json"
	"math"
	"unicode/utf8"
)

const registrySchema = "texthue-registry-v2"
const legacyRegistrySchema = "texthue-registry-v1"

func (p Assignment) valid() bool {
	return p.HueFraction >= 0 && p.HueFraction < 1 && p.Ring >= 0 && uint64(p.Ring) <= 1<<53-1
}

func (r *Resolver) registryFingerprint(legacy bool) (string, error) {
	payload, err := r.configPayload()
	if err != nil {
		return "", err
	}
	return r.digestForConfig(payload["options"].(map[string]any), legacy)
}

// ExportRegistry serializes caller-owned assignments against the current configuration.
func (r *Resolver) ExportRegistry(assignments map[string]Assignment) ([]byte, error) {
	sum, err := r.registryFingerprint(false)
	if err != nil {
		return nil, err
	}
	if assignments == nil {
		assignments = map[string]Assignment{}
	}
	for name, p := range assignments {
		if !utf8.ValidString(name) || !p.valid() {
			return nil, invalid("registry placement")
		}
	}
	return json.Marshal(map[string]any{"schema": registrySchema, "algorithm": Version, "fingerprint": sum, "assignments": assignments})
}

// ImportRegistry returns independent pins for Assign after checking configuration compatibility.
func (r *Resolver) ImportRegistry(data []byte) (map[string]Assignment, error) {
	var saved map[string]any
	if !validJSONUnicode(data) || json.Unmarshal(data, &saved) != nil || len(saved) != 4 ||
		(saved["schema"] != registrySchema && saved["schema"] != legacyRegistrySchema) || saved["algorithm"] != Version {
		return nil, invalid("registry schema or algorithm")
	}
	sum, err := r.registryFingerprint(saved["schema"] == legacyRegistrySchema)
	if err != nil {
		return nil, err
	}
	if saved["fingerprint"] != sum {
		return nil, invalid("registry configuration fingerprint")
	}
	items, ok := saved["assignments"].(map[string]any)
	if !ok {
		return nil, invalid("registry assignments")
	}
	result := make(map[string]Assignment, len(items))
	for name, value := range items {
		p, ok := value.(map[string]any)
		if !ok || len(p) != 3 {
			return nil, invalid("registry placement")
		}
		hue, hueOK := p["hueFraction"].(float64)
		ring, ringOK := p["ring"].(float64)
		moved, movedOK := p["moved"].(bool)
		if !hueOK || !ringOK || !movedOK || hue < 0 || hue >= 1 || ring < 0 ||
			math.Trunc(ring) != ring || ring > 1<<53-1 {
			return nil, invalid("registry placement")
		}
		result[name] = Assignment{hue, int64(ring), moved}
	}
	return result, nil
}
