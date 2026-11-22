package texthue_test

import (
	"encoding/json"
	"errors"
	"fmt"
	texthue "github.com/HusteDev/texthue/packages/go"
)

func ExampleResolve_brand() {
	options := []texthue.Option{
		texthue.WithPalette([]texthue.PaletteEntry{{ID: "ocean", BrandPair: texthue.BrandPair{Light: "#117799"}}}),
		texthue.WithOverrides(map[string]texthue.Override{"urgent": {Light: "#aa3311", Dark: "#ffaa99"}}),
	}
	for _, label := range []string{"research", "urgent"} {
		color, err := texthue.Resolve(label, options...)
		if err != nil {
			panic(err)
		}
		fmt.Println(color.Source, color.Light.Fill.Hex)
	}
	// Output:
	// palette #117799
	// override #aa3311
}

// ExampleResolve prints every output format for the default options.
func ExampleResolve() {
	colors, err := texthue.Resolve("research", nil)
	if err != nil {
		panic(err)
	}
	fmt.Println(colors.Light.Fill.Hex)
	fmt.Println(colors.Dark.Fill.Hex)
	fmt.Printf("rgb(%d %d %d)\n", colors.Light.Fill.RGB.R, colors.Light.Fill.RGB.G, colors.Light.Fill.RGB.B)
	fmt.Printf("hsl(%g %g%% %g%%)\n", colors.Light.Fill.HSL.H, colors.Light.Fill.HSL.S, colors.Light.Fill.HSL.L)
	fmt.Printf("oklch(%g %g %g)\n", colors.Light.Fill.OKLCH.L, colors.Light.Fill.OKLCH.C, colors.Light.Fill.OKLCH.H)
	// Output:
	// #59b8d8
	// #255464
	// rgb(89 184 216)
	// hsl(195.11811 61.95122% 59.803922%)
	// oklch(0.737459 0.100435 222.843011)
}

// ExampleResolve_tuning sets every option with independent ranges per theme and role.
func ExampleResolve_tuning() {
	options := &texthue.Options{
		Namespace:      "workspace:demo",
		Backgrounds:    &texthue.Backgrounds{Light: texthue.Ptr("#f5f0e8"), Dark: texthue.Ptr("#20242b")},
		ContrastTarget: texthue.Ptr(7.0),
		Profiles: &texthue.Profiles{
			Light: &texthue.ThemeProfiles{
				Fill: &texthue.Profile{Lightness: &texthue.Range{.74, .84}, ChromaScale: &texthue.Range{.08, .14}},
				Text: &texthue.Profile{Lightness: &texthue.Range{.40, .52}, ChromaScale: &texthue.Range{.10, .16}},
			},
			Dark: &texthue.ThemeProfiles{
				Fill: &texthue.Profile{Lightness: &texthue.Range{.38, .48}, ChromaScale: &texthue.Range{.08, .14}},
				Text: &texthue.Profile{Lightness: &texthue.Range{.74, .86}, ChromaScale: &texthue.Range{.10, .16}},
			},
		},
	}
	colors, err := texthue.Resolve("project:atlas", options)
	if err != nil {
		panic(err)
	}
	fmt.Println(colors.Light.Contrast.Fill.MeetsTarget, colors.Dark.Contrast.Text.MeetsTarget)
	// Output: true true
}

// ExampleResolve_grayscale fixes lightness and requests zero chroma.
func ExampleResolve_grayscale() {
	colors, err := texthue.Resolve("plain", &texthue.Options{
		Profiles: &texthue.Profiles{Light: &texthue.ThemeProfiles{Fill: &texthue.Profile{
			Lightness: &texthue.Range{.75, .75}, ChromaScale: &texthue.Range{0, 0},
		}}},
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(colors.Light.Fill.OKLCH.C)
	// Output: 0
}

// ExampleResolve_impossibleContrast shows the explicit fallback when no text
// can reach the target against a mid-gray background.
func ExampleResolve_impossibleContrast() {
	colors, err := texthue.Resolve("project:atlas", &texthue.Options{
		Backgrounds: &texthue.Backgrounds{Light: texthue.Ptr("#777777")}, ContrastTarget: texthue.Ptr(7.0),
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(colors.Light.Contrast.Text.MeetsTarget)
	fmt.Println(*colors.Light.Contrast.Text.Fallback)
	// Output:
	// false
	// unattainable-contrast
}

// ExampleResolve_errors inspects the stable error code with errors.As.
func ExampleResolve_errors() {
	_, err := texthue.Resolve("research", &texthue.Options{ContrastTarget: texthue.Ptr(22.0)})
	var invalid *texthue.Error
	if errors.As(err, &invalid) {
		fmt.Println(invalid.Code)
	}
	// Output: INVALID_OPTIONS
}

// ExampleParseOptions loads the shared JSON options document and serializes a result.
func ExampleParseOptions() {
	options, err := texthue.ParseOptions([]byte(`{"namespace":"labels","profiles":{"light":{"fill":{"chromaScale":[0,0]}}}}`))
	if err != nil {
		panic(err)
	}
	colors, err := texthue.Resolve("research", options...)
	if err != nil {
		panic(err)
	}
	encoded, err := json.Marshal(colors.Light.Fill.RGB)
	if err != nil {
		panic(err)
	}
	fmt.Println(colors.Light.Fill.OKLCH.C == 0)
	fmt.Println(len(encoded) > 0)
	// Output:
	// true
	// true
}

// ExampleResolve_identity shows that a stable identifier always maps to the same colors.
func ExampleResolve_identity() {
	options := &texthue.Options{Namespace: "projects"}
	first, err := texthue.Resolve("project-id:42", options)
	if err != nil {
		panic(err)
	}
	second, err := texthue.Resolve("project-id:42", options)
	if err != nil {
		panic(err)
	}
	fmt.Println(first.Light.Fill.Hex == second.Light.Fill.Hex)
	// Output: true
}
