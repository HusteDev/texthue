package texthue

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
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
			result, err := Resolve(text, options)
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
		{Namespace: string([]byte{0xff})}, {ContrastTarget: Ptr(math.NaN())}, {ContrastTarget: Ptr(math.Inf(1))},
		{Profiles: &Profiles{Light: &ThemeProfiles{Fill: &Profile{Lightness: &Range{0, math.NaN()}}}}},
		{Backgrounds: &Backgrounds{Light: Ptr("")}},
	} {
		_, err := Resolve("x", options)
		if !errors.As(err, &typed) || typed.Code != "INVALID_OPTIONS" {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	for _, data := range []string{`{"contrastTarget":4.5} true`, `{"profiles":{"light":{"fill":{"chroma":[0,0.1,0.2]}}}}`, `{"Namespace":"x"}`} {
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
	options, err := ParseOptions([]byte(`{"profiles":{"light":{"fill":{"chroma":[0,0]}}},"profiles":{}}`))
	if err != nil {
		t.Fatal(err)
	}
	got, err := Resolve("research", options)
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
						pair = rgb8{255, 255, 255}
					}
					if i == 3 {
						pair = rgb8{18, 18, 18}
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
