package texthue

import (
	"encoding/json"
	"strconv"
	"unicode/utf8"
)

// validJSONUnicode reports whether data is valid UTF-8 and every \u escape
// inside a JSON string is well formed: no lone surrogates, and every high
// surrogate is immediately followed by a low surrogate escape.
//
// encoding/json silently replaces malformed text with U+FFFD, which would let
// two different malformed inputs resolve to the same color. This check runs
// before decoding so such inputs are rejected instead.
func validJSONUnicode(data []byte) bool {
	if !utf8.Valid(data) {
		return false
	}
	inString := false
	for i := 0; i < len(data); i++ {
		if data[i] == '"' {
			inString = !inString
			continue
		}
		if !inString || data[i] != '\\' {
			continue
		}
		if i+1 >= len(data) {
			return false
		}
		if data[i+1] != 'u' {
			// Any other escape is two bytes; skip its second byte so an
			// escaped quote does not toggle inString.
			i++
			continue
		}
		if i+6 > len(data) {
			return false
		}
		unit, err := strconv.ParseUint(string(data[i+2:i+6]), 16, 16)
		if err != nil {
			return false
		}
		if unit >= 0xd800 && unit <= 0xdbff {
			if i+12 > len(data) || data[i+6] != '\\' || data[i+7] != 'u' {
				return false
			}
			next, err := strconv.ParseUint(string(data[i+8:i+12]), 16, 16)
			if err != nil || next < 0xdc00 || next > 0xdfff {
				return false
			}
			i += 11
		} else {
			if unit >= 0xdc00 && unit <= 0xdfff {
				return false
			}
			i += 5
		}
	}
	return true
}

// jsonShape describes the expected type at one position of the options
// document. kind is "string", "number", or "range"; an empty kind denotes an
// object whose permitted keys are listed in fields.
type jsonShape struct {
	kind   string
	fields map[string]*jsonShape
}

var stringShape = &jsonShape{kind: "string"}
var numberShape = &jsonShape{kind: "number"}
var rangeShape = &jsonShape{kind: "range"}
var profileShape = &jsonShape{fields: map[string]*jsonShape{"lightness": rangeShape, "chromaScale": rangeShape, "chromaCap": numberShape}}
var themeShape = &jsonShape{fields: map[string]*jsonShape{"fill": profileShape, "text": profileShape}}

// optionsShape is the complete schema for the language-neutral options document.
var pairShape = &jsonShape{fields: map[string]*jsonShape{"light": stringShape, "dark": stringShape}}
var paletteEntryShape = &jsonShape{fields: map[string]*jsonShape{"light": stringShape, "dark": stringShape, "id": stringShape}}
var optionsShape = &jsonShape{fields: map[string]*jsonShape{
	"palette": {kind: "palette"}, "overrides": {kind: "overrides"},
	"foregrounds": {kind: "strings"}, "foregroundPolicy": stringShape,
	"namespace":      stringShape,
	"seed":           numberShape,
	"contrastTarget": numberShape,
	"preset":         stringShape, "hueRange": rangeShape, "excludeHues": {kind: "ranges"},
	"normalize":       {fields: map[string]*jsonShape{"unicode": stringShape, "case": stringShape, "whitespace": stringShape}},
	"contrastTargets": {fields: map[string]*jsonShape{"fill": numberShape, "fillHover": numberShape, "fillActive": numberShape, "border": numberShape, "text": numberShape, "textOnSubtle": numberShape, "strong": numberShape}},
	"backgrounds":     {fields: map[string]*jsonShape{"light": stringShape, "dark": stringShape}},
	"profiles":        {fields: map[string]*jsonShape{"light": themeShape, "dark": themeShape}},
}}

// checkShape validates a decoded JSON value against shape, rejecting unknown
// keys, nulls, and wrong types at every level. path names the failing
// position in the returned error.
func checkShape(value any, shape *jsonShape, path string) error {
	switch shape.kind {
	case "string":
		if _, ok := value.(string); !ok {
			return invalid(path)
		}
	case "number":
		if _, ok := value.(float64); !ok {
			return invalid(path)
		}
	case "palette":
		entries, ok := value.([]any)
		if !ok || len(entries) == 0 {
			return invalid(path)
		}
		for _, entry := range entries {
			if err := checkShape(entry, paletteEntryShape, path); err != nil {
				return err
			}
			fields := entry.(map[string]any)
			if _, exists := fields["id"]; !exists {
				return invalid(path)
			}
			for _, key := range []string{"light", "dark"} {
				if hex, ok := fields[key]; ok {
					if _, err := background(hex.(string)); err != nil {
						return invalid(path)
					}
				}
			}
		}
	case "overrides":
		entries, ok := value.(map[string]any)
		if !ok {
			return invalid(path)
		}
		for _, v := range entries {
			if _, ok := v.(string); !ok {
				if err := checkShape(v, pairShape, path); err != nil {
					return err
				}
			}
		}
	case "strings":
		values, ok := value.([]any)
		if !ok {
			return invalid(path)
		}
		for _, v := range values {
			if err := checkShape(v, stringShape, path); err != nil {
				return err
			}
		}
	case "ranges":
		values, ok := value.([]any)
		if !ok {
			return invalid(path)
		}
		for _, v := range values {
			if err := checkShape(v, rangeShape, path); err != nil {
				return err
			}
		}
	case "range":
		values, ok := value.([]any)
		if !ok || len(values) != 2 {
			return invalid(path)
		}
		for _, item := range values {
			if _, ok := item.(float64); !ok {
				return invalid(path)
			}
		}
	default:
		fields, ok := value.(map[string]any)
		if !ok {
			return invalid(path)
		}
		for key, child := range fields {
			next, ok := shape.fields[key]
			if !ok {
				return invalid(path + "." + key)
			}
			if err := checkShape(child, next, path+"."+key); err != nil {
				return err
			}
		}
	}
	return nil
}

// ParseOptions decodes the language-neutral JSON options document shared by
// all TextHue libraries and returns an Options value ready for Resolve.
//
// It enforces the full contract: unknown or incorrectly cased keys, explicit
// nulls, wrong types, malformed ranges, invalid or lone-surrogate \u escapes,
// malformed UTF-8, trailing data, and out-of-bounds values are all rejected
// with a *Error. Duplicate object keys replace earlier values, matching
// JSON.parse and json.loads.
//
// Prefer ParseOptions over json.Unmarshal into Options when settings come from
// files, configuration, or another process, because encoding/json ignores
// unknown keys and replaces malformed Unicode rather than rejecting it.
func ParseOptions(data []byte) ([]Option, error) {
	if !validJSONUnicode(data) {
		return nil, invalid("JSON Unicode")
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, invalid("JSON")
	}
	if err := checkShape(value, optionsShape, "options"); err != nil {
		return nil, err
	}
	var options Options
	// Decode the validated map, not the original JSON: duplicate object keys
	// must replace earlier values, as in JSON.parse/json.loads, rather than
	// merging old struct fields during encoding/json's second decode.
	canonical, err := json.Marshal(value)
	if err != nil {
		return nil, invalid("JSON")
	}
	if err := json.Unmarshal(canonical, &options); err != nil {
		return nil, invalid("JSON")
	}
	if _, err := NewResolver(&options); err != nil {
		return nil, err
	}
	return []Option{&options}, nil
}
