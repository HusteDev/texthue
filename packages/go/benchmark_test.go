package texthue

import (
	"sort"
	"strconv"
	"testing"
	"time"
)

type contrastScenario struct {
	name   string
	target float64
	light  string
	extra  []Option
}

var contrastWorkScenarios = []contrastScenario{
	{"default", 4.5, "#ffffff", nil}, {"aaa", 7, "#ffffff", nil}, {"maximum", 21, "#ffffff", nil},
	{"gray", 4.5, "#777777", nil}, {"impossible", 21, "#777777", nil},
}

func TestContrastWorkCorpus(t *testing.T) {
	for _, scenario := range contrastWorkScenarios {
		t.Run(scenario.name, func(t *testing.T) {
			resolver, err := NewResolver(WithContrastTarget(scenario.target), WithBackgrounds(scenario.light, "#121212"))
			if err != nil {
				t.Fatal(err)
			}
			for index := 0; index < 100; index++ {
				if _, err := resolver.Resolve("item:" + strconv.Itoa(index)); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestHexWorkCorpus(t *testing.T) {
	for _, role := range []string{"background", "fill", "fillHover", "text"} {
		t.Run(role, func(t *testing.T) {
			resolver, err := NewResolver()
			if err != nil {
				t.Fatal(err)
			}
			for index := 0; index < 100; index++ {
				if _, err := resolver.Hex("item:"+strconv.Itoa(index), "dark", role); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func BenchmarkResolverContrast(b *testing.B) {
	scenarios := append([]contrastScenario{
		{"apca", 75, "#ffffff", []Option{WithContrastModel("apca")}},
		{"p3", 4.5, "#ffffff", []Option{WithGamut("display-p3")}},
	}, contrastWorkScenarios...)
	for _, scenario := range scenarios {
		b.Run(scenario.name, func(b *testing.B) {
			options := []Option{WithContrastTarget(scenario.target), WithBackgrounds(scenario.light, "#121212")}
			resolver, err := NewResolver(append(options, scenario.extra...)...)
			if err != nil {
				b.Fatal(err)
			}
			labels := make([]string, 100)
			for i := -20; i < len(labels); i++ {
				label := "item:" + strconv.Itoa(i)
				if i >= 0 {
					labels[i] = label
				} else if _, err := resolver.Resolve(label); err != nil {
					b.Fatal(err)
				}
			}
			// Keep latency samples bounded even when Go calibrates a long benchmark.
			samples := make([]time.Duration, 0, len(labels))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				start := time.Now()
				// Amortize the Windows monotonic clock tick across 100 resolves.
				for repeat := 0; repeat < 100; repeat++ {
					if _, err := resolver.Resolve(labels[i%len(labels)]); err != nil {
						b.Fatal(err)
					}
				}
				if i < len(labels) {
					samples = append(samples, time.Since(start)/100)
				}
			}
			b.StopTimer()
			sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
			n := len(samples)
			b.ReportMetric(float64(samples[(n-1)/2]+samples[n/2])/2000, "median-us")
			b.ReportMetric(float64(samples[(95*n+99)/100-1])/1000, "p95-us")
		})
	}
}

func BenchmarkAssign40(b *testing.B) {
	resolver, err := NewResolver()
	if err != nil {
		b.Fatal(err)
	}
	labels := make([]string, 40)
	for i := range labels {
		labels[i] = "item:" + strconv.Itoa(i)
	}
	for i := 0; i < 5; i++ {
		if _, err := resolver.Assign(labels, nil); err != nil {
			b.Fatal(err)
		}
	}
	samples := make([]time.Duration, 0, 20)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		start := time.Now()
		if _, err := resolver.Assign(labels, nil); err != nil {
			b.Fatal(err)
		}
		if len(samples) < cap(samples) {
			samples = append(samples, time.Since(start))
		}
	}
	b.StopTimer()
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	n := len(samples)
	b.ReportMetric(float64(samples[(n-1)/2]+samples[n/2])/2000, "median-us")
	b.ReportMetric(float64(samples[(95*n+99)/100-1])/1000, "p95-us")
}
