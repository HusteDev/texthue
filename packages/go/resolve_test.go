package texthue

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// vector is one entry from testdata/vectors.json. Valid entries carry Expected;
// invalid entries carry Code. Text and Options stay raw so malformed fixtures
// can be checked at the JSON boundary.
type vector struct {
	ID       string          `json:"id"`
	Text     json.RawMessage `json:"text"`
	Options  json.RawMessage `json:"options"`
	Expected json.RawMessage `json:"expected"`
	Code     string          `json:"code"`
}

// fixture loads the frozen conformance vectors bundled with the module.
func fixture(t *testing.T) (valid, invalids []vector) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var source struct {
		Vectors []vector `json:"vectors"`
		Invalid []vector `json:"invalid"`
	}
	if err = json.Unmarshal(data, &source); err != nil {
		t.Fatal(err)
	}
	return source.Vectors, source.Invalid
}

// compare recursively checks a decoded result against an expected fixture.
// RGB bytes must match exactly, HSL and OKLCH fields within one unit in the
// sixth decimal, and every other number within 1e-12.
func compare(t *testing.T, actual, expected any, path string) {
	t.Helper()
	switch want := expected.(type) {
	case map[string]any:
		got, ok := actual.(map[string]any)
		if !ok || len(got) != len(want) {
			t.Fatalf("%s: object shape differs", path)
		}
		for key, value := range want {
			compare(t, got[key], value, path+"."+key)
		}
	case float64:
		got, ok := actual.(float64)
		if !ok {
			t.Fatalf("%s: expected number", path)
		}
		tolerance := 1e-12
		if strings.Contains(path, ".hsl.") || strings.Contains(path, ".oklch.") {
			tolerance = 1.000001e-6
		}
		if strings.Contains(path, ".rgb.") {
			tolerance = 0
		}
		if math.IsNaN(got) || math.Abs(got-want) > tolerance {
			t.Errorf("%s: got %.15g, want %.15g", path, got, want)
		}
	default:
		if !reflect.DeepEqual(actual, expected) {
			t.Errorf("%s: got %v, want %v", path, actual, expected)
		}
	}
}

// TestConformance resolves every valid vector and compares the full result.
func TestConformance(t *testing.T) {
	vectors, _ := fixture(t)
	for _, item := range vectors {
		t.Run(item.ID, func(t *testing.T) {
			var text string
			if err := json.Unmarshal(item.Text, &text); err != nil {
				t.Fatal(err)
			}
			options, err := ParseOptions(item.Options)
			if err != nil {
				t.Fatal(err)
			}
			result, err := Resolve(text, options...)
			if err != nil {
				t.Fatal(err)
			}
			encoded, err := json.Marshal(result)
			if err != nil {
				t.Fatal(err)
			}
			var actual, expected any
			if err = json.Unmarshal(encoded, &actual); err != nil {
				t.Fatal(err)
			}
			if err = json.Unmarshal(item.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			compare(t, actual, expected, "result")
		})
	}
}

// TestInvalidConformance checks that every invalid vector is rejected with the
// expected code, either by ParseOptions or at the JSON text boundary.
func TestInvalidConformance(t *testing.T) {
	_, vectors := fixture(t)
	for _, item := range vectors {
		t.Run(item.ID, func(t *testing.T) {
			// The Go signature excludes non-string inputs. Check those at JSON entry.
			var text string
			if item.Code == "INVALID_TEXT" {
				if string(item.Text) != "null" && validJSONUnicode(item.Text) && json.Unmarshal(item.Text, &text) == nil {
					t.Fatal("invalid fixture text was accepted at the JSON boundary")
				}
				return
			}
			_, err := ParseOptions(item.Options)
			var typed *Error
			if !errors.As(err, &typed) || typed.Code != item.Code {
				t.Fatalf("got %v, want %s", err, item.Code)
			}
		})
	}
}

// TestRuntimeErrors covers rejections that JSON fixtures cannot express:
// invalid UTF-8, NaN and infinity, and structurally malformed JSON documents.
func TestRuntimeErrors(t *testing.T) {
	_, err := Resolve(string([]byte{0xff}), nil)
	var typed *Error
	if !errors.As(err, &typed) || typed.Code != "INVALID_TEXT" {
		t.Fatal(err)
	}
	for _, options := range []*Options{
		{Namespace: string([]byte{0xff})}, {ContrastTarget: ptr(math.NaN())}, {ContrastTarget: ptr(math.Inf(1))},
		{Profiles: &Profiles{Light: &ThemeProfiles{Fill: &Profile{Lightness: &Range{0, math.NaN()}}}}},
		{Backgrounds: &Backgrounds{Light: ptr("")}},
	} {
		_, err := Resolve("x", options)
		if !errors.As(err, &typed) || typed.Code != "INVALID_OPTIONS" {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	for _, data := range []string{`{"contrastTarget":4.5} true`, `{"profiles":{"light":{"fill":{"chromaScale":[0,0.1,0.2]}}}}`, `{"Namespace":"x"}`} {
		if _, err := ParseOptions([]byte(data)); err == nil {
			t.Fatal("accepted", data)
		}
	}
}

// TestConcurrentDeterminism resolves the same input from many goroutines and
// requires identical results.
func TestConcurrentDeterminism(t *testing.T) {
	want, err := Resolve("research", nil)
	if err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for i := 0; i < 32; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			got, err := Resolve("research", nil)
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Error("concurrent result differs", err)
			}
		}()
	}
	group.Wait()
}

// TestJSONDuplicateObjectsReplaceRatherThanMerge checks that a repeated object
// key replaces the earlier object entirely, as JSON.parse and json.loads do.
func TestJSONDuplicateObjectsReplaceRatherThanMerge(t *testing.T) {
	options, err := ParseOptions([]byte(`{"profiles":{"light":{"fill":{"chromaScale":[0,0]}}},"profiles":{}}`))
	if err != nil {
		t.Fatal(err)
	}
	got, err := Resolve("research", options...)
	if err != nil {
		t.Fatal(err)
	}
	want, err := Resolve("research", nil)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatal("duplicate object keys retained values from the replaced object", err)
	}
}

// TestDefaultRangeSweep samples every default profile across all hues and
// requires each fitted color to meet the 4.5 default target after RGB rounding.
func TestDefaultRangeSweep(t *testing.T) {
	count := 0
	for i, bounds := range []Range{{.72, .82}, {.4, .5}, {.45, .55}, {.72, .82}} {
		for hue := 0.0; hue < 360; hue += .5 {
			for _, lightness := range []float64{bounds[0], (bounds[0] + bounds[1]) / 2, bounds[1]} {
				for _, chroma := range []float64{.1, .13, .16} {
					rgb := fit(lightness, chroma, hue).rgb
					pair := foreground(rgb)
					if i == 2 {
						pair = encodedRGB{255, 255, 255}
					}
					if i == 3 {
						pair = encodedRGB{18, 18, 18}
					}
					if contrast(rgb, pair) < 4.5 {
						t.Fatalf("unreadable default: %v", rgb)
					}
					count++
				}
			}
		}
	}
	if count != 25920 {
		t.Fatal(count)
	}
}

func TestDefaultScaleRepairRate(t *testing.T) {
	const count = 25920
	var repairs [2][7]int
	for i := 0; i < count; i++ {
		result, err := Resolve("sweep:"+strconv.Itoa(i), nil)
		if err != nil {
			t.Fatal(err)
		}
		for j, theme := range []ThemeColors{result.Light, result.Dark} {
			m := theme.Contrast
			for k, v := range []ContrastResult{m.Fill, m.FillHover, m.FillActive, m.Border, m.Text, m.TextOnSubtle, m.Strong} {
				if !v.MeetsTarget {
					t.Fatalf("sample %d theme %d relationship %d failed", i, j, k)
				}
				if v.LightnessAdjusted {
					repairs[j][k]++
				}
			}
		}
	}
	for j, row := range repairs {
		for k, v := range row {
			if v > count/20 {
				t.Errorf("theme %d relationship %d repaired %d of %d", j, k, v, count)
			}
		}
	}
}

func TestStrictHexRelationships(t *testing.T) {
	opts, err := ParseOptions([]byte(`{"overrides":{"sample":"#777777"},"foregrounds":["#777777"],"contrastTargets":{"text":1,"textOnSubtle":21}}`))
	if err != nil {
		t.Fatal(err)
	}
	resolver, err := NewResolver(opts...)
	if err != nil {
		t.Fatal(err)
	}
	for _, role := range []string{"fill", "onFill", "text"} {
		if _, err := resolver.Hex("sample", "light", role); err != nil {
			t.Fatal(err)
		}
		_, err := resolver.HexStrict("sample", "light", role)
		var typed *Error
		if !errors.As(err, &typed) || typed.Code != "UNMET_CONSTRAINT" {
			t.Fatalf("%s: %v", role, err)
		}
	}
	if _, err := resolver.HexStrict("sample", "light", "border"); err != nil {
		t.Fatal(err)
	}
}

func TestPortableConfigFingerprint(t *testing.T) {
	data, err := os.ReadFile("../../conformance/config-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	resolver, err := ImportConfig(data)
	if err != nil {
		t.Fatal(err)
	}
	exported, err := resolver.ExportConfig()
	if err != nil {
		t.Fatal(err)
	}
	var roundTrip map[string]any
	if err := json.Unmarshal(exported, &roundTrip); err != nil || !reflect.DeepEqual(value, roundTrip) {
		t.Fatalf("round trip mismatch: %s, %v", exported, err)
	}
	colors, err := resolver.Resolve("🐈")
	if err != nil || colors.Light.Fill.Hex != "#ab1234" {
		t.Fatalf("override replay: %s %v", colors.Light.Fill.Hex, err)
	}
	want := value["fingerprint"]
	delete(value, "fingerprint")
	got, err := fingerprint(value)
	if err != nil || got != want {
		t.Fatalf("fingerprint %s, want %s: %v", got, want, err)
	}
}

func TestConfigRejectsChangedAndIncompletePayloads(t *testing.T) {
	r, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := r.ExportConfig()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []string{"tampered", "unexpanded", "algorithm"} {
		var payload map[string]any
		if err := json.Unmarshal(encoded, &payload); err != nil {
			t.Fatal(err)
		}
		switch test {
		case "tampered":
			payload["options"].(map[string]any)["seed"] = float64(5)
		case "unexpanded":
			delete(payload["options"].(map[string]any), "seed")
			delete(payload, "fingerprint")
			digest, err := fingerprint(payload)
			if err != nil {
				t.Fatal(err)
			}
			payload["fingerprint"] = digest
		case "algorithm":
			payload["algorithm"] = "unknown"
		}
		data, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ImportConfig(data); err == nil {
			t.Errorf("accepted %s config", test)
		}
	}
}

func TestRegistryReplay(t *testing.T) {
	data, err := os.ReadFile("../../conformance/registry-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	r, err := NewResolver(WithSeed(123))
	if err != nil {
		t.Fatal(err)
	}
	pins, err := r.ImportRegistry(data)
	if err != nil {
		t.Fatal(err)
	}
	next, err := r.Assign([]string{"new", "old"}, pins)
	if err != nil {
		t.Fatal(err)
	}
	original, err := r.Assign([]string{"old", "keep", "__proto__"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(next.Colors["old"], original.Colors["old"]) {
		t.Fatal("changed rendered colors")
	}
	for key, p := range pins {
		if next.Assignments[key] != p {
			t.Errorf("changed placement for %q", key)
		}
	}
	out, err := r.ExportRegistry(pins)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := r.ImportRegistry(out)
	if err != nil || !reflect.DeepEqual(restored, pins) {
		t.Fatalf("registry round trip: %v", err)
	}
	other, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := other.ImportRegistry(data); err == nil {
		t.Fatal("accepted different configuration")
	}
}

func TestLinearLightComposite(t *testing.T) {
	data, err := os.ReadFile("../../conformance/composite-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Source, Backdrop, Expected string
		Alpha                      float64
	}
	if err = json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		bases, err := Resolve("blend", WithBackgrounds(c.Source, c.Backdrop))
		if err != nil {
			t.Fatal(err)
		}
		result, err := CompositeOver(bases.Light.Background, c.Alpha, bases.Dark.Background)
		if err != nil || result.Hex != c.Expected {
			t.Fatalf("composite %s: %v", result.Hex, err)
		}
		replay, err := Resolve("blend", WithColorBackgrounds(result, result))
		if err != nil || replay.Light.Background != result {
			t.Fatalf("background: %v", err)
		}
		if _, err := CompositeOver(result, math.NaN(), result); err == nil {
			t.Fatal("accepted NaN")
		}
	}
}

func TestAPCAReference(t *testing.T) {
	data, err := os.ReadFile("../../conformance/apca-srgb-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows [][7]float64
	if err = json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	for i, row := range rows {
		fg := encodedRGB{row[0], row[1], row[2]}
		bg := encodedRGB{row[3], row[4], row[5]}
		if got := apcaContrast(fg, bg); math.Abs(got-row[6]) >= 1e-10 {
			t.Fatalf("pair %d: got %g, want %g", i, got, row[6])
		}
	}
}

func TestContrastModelJSON(t *testing.T) {
	for _, data := range []string{`{"contrastModel":""}`, `{"contrastModel":[]}`, `{"contrastModel":"apca","contrastTarget":107}`} {
		if _, err := ParseOptions([]byte(data)); err == nil {
			t.Fatalf("accepted %s", data)
		}
	}
}

func TestDisplayP3Fit(t *testing.T) {
	data, err := os.ReadFile("../../conformance/p3-fit-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		L, C, H       float64
		RGB, Fallback encodedRGB
		Clipped       bool
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		fit := fitIn(row.L, row.C, row.H, xyzToP3)
		fallback, clipped := p3Fallback(fit.rgb)
		if fit.rgb != row.RGB || fallback != row.Fallback || clipped != row.Clipped {
			t.Fatalf("OKLCH %g %g %g: RGB %v fallback %v clipped %t", row.L, row.C, row.H, fit.rgb, fallback, clipped)
		}
	}
	red, err := ToCSS(formats(encodedRGB{255, 0, 0}), "p3")
	if err != nil || red != "color(display-p3 0.917488 0.200287 0.138561)" {
		t.Fatalf("red CSS: %s %v", red, err)
	}
	if cuspIn(.7, 145, xyzToP3) <= cusp(.7, 145) {
		t.Fatal("expected wider green gamut")
	}
}

func TestDisplayP3Contrast(t *testing.T) {
	data, err := os.ReadFile("../../conformance/p3-contrast-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Text, Background encodedRGB
		Ratio, Lc        float64
	}
	if err = json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if math.Abs(p3Contrast(row.Text, row.Background)-row.Ratio) > 1e-10 ||
			math.Abs(p3APCAContrast(row.Text, row.Background)-row.Lc) > 1e-10 {
			t.Fatalf("P3 pair %v %v", row.Text, row.Background)
		}
	}
}

func TestDisplayP3BatchIsolation(t *testing.T) {
	r, err := NewResolver(WithGamut("display-p3"), WithContrastModel("apca"))
	if err != nil {
		t.Fatal(err)
	}
	results, err := r.Batch([]string{"sample", "sample"})
	if err != nil {
		t.Fatal(err)
	}
	original := results[1].Light.Fill.P3.R
	results[0].Light.Fill.P3.R = -1
	*results[0].Light.Contrast.Fill.Value = 999
	if results[1].Light.Fill.P3.R != original || *results[1].Light.Contrast.Fill.Value == 999 {
		t.Fatal("shared mutable batch results")
	}
	css, err := ToCSS(results[1].Light.Fill, "p3")
	if err != nil || css != results[1].Light.Fill.CSS {
		t.Fatal("native P3 CSS was lost")
	}
}

func TestSelectedRolesMatchBothFullThemes(t *testing.T) {
	for _, gamut := range []string{"srgb", "display-p3"} {
		resolver, err := NewResolver(WithGamut(gamut), WithBackgrounds("#458ac2", "#cc9142"))
		if err != nil {
			t.Fatal(err)
		}
		full, err := resolver.Resolve("example")
		if err != nil {
			t.Fatal(err)
		}
		for theme, palette := range map[string]ThemeColors{"light": full.Light, "dark": full.Dark} {
			for role, want := range palette.roles() {
				got, err := resolver.Color("example", theme, role)
				if err != nil || !reflect.DeepEqual(got, want) {
					t.Fatalf("%s %s.%s: got %+v, want %+v, error %v", gamut, theme, role, got, want, err)
				}
			}
		}
	}
}
