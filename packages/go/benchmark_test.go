package texthue

import (
	"sort"
	"strconv"
	"testing"
	"time"
)

func BenchmarkResolverContrast(b *testing.B) {
	for _, scenario := range []struct {
		name   string
		target float64
		light  string
	}{
		{"default", 4.5, "#ffffff"}, {"aaa", 7, "#ffffff"}, {"maximum", 21, "#ffffff"},
		{"gray", 4.5, "#777777"}, {"impossible", 21, "#777777"},
	} {
		b.Run(scenario.name, func(b *testing.B) {
			resolver, err := NewResolver(WithContrastTarget(scenario.target), WithBackgrounds(scenario.light, "#121212"))
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
