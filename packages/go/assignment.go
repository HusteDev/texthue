package texthue

import (
	"bytes"
	"encoding/binary"
	"math"
	"sort"
	"unicode/utf8"
)

type Assignment struct {
	HueFraction float64 `json:"hueFraction"`
	Ring        int     `json:"ring"`
	Moved       bool    `json:"moved"`
}

type AssignmentReport struct {
	MinDistance        *float64    `json:"minDistance"`
	ClosestPairs       [][2]string `json:"closestPairs"`
	WithinRingCapacity bool        `json:"withinRingCapacity"`
	DistinctFills      bool        `json:"distinctFills"`
}

type Collection struct {
	Colors      map[string]ColorSet   `json:"colors"`
	Assignments map[string]Assignment `json:"assignments"`
	Report      AssignmentReport      `json:"report"`
}

func fillPair(color ColorSet) [2]triple {
	var pair [2]triple
	for i, rgb := range []RGB{color.Light.Fill.RGB, color.Dark.Fill.RGB} {
		pair[i] = encodedOKLab(encodedRGB{float64(rgb.R), float64(rgb.G), float64(rgb.B)}, rgbToXYZ)
	}
	return pair
}

func separationScore(pair [2]triple, occupied [][2]triple) float64 {
	best := math.Inf(1)
	for _, previous := range occupied {
		for i, a := range pair {
			b := previous[i]
			best = math.Min(best, math.Hypot(a[0]-b[0], math.Hypot(a[1]-b[1], a[2]-b[2])))
		}
	}
	return best
}

func place(natural float64, occupied map[string]Assignment, separation float64) Assignment {
	for ring := 0; ; ring++ {
		for i := 0; i <= 384; i++ {
			step := (i + 1) / 2
			if i%2 != 0 {
				step = -step
			}
			hue := natural + float64(step)*(separation/4)
			hue -= math.Floor(hue)
			feasible := true
			for _, other := range occupied {
				if other.Ring != ring {
					continue
				}
				d := math.Abs(other.HueFraction - hue)
				if math.Min(d, 1-d) < separation {
					feasible = false
					break
				}
			}
			if feasible {
				return Assignment{hue, ring, ring != 0 || i != 0}
			}
		}
	}
}

func (r *Resolver) Assign(texts []string, pinned map[string]Assignment) (Collection, error) {
	result := Collection{Colors: map[string]ColorSet{}, Assignments: map[string]Assignment{}}
	digests := map[string][]byte{}
	names := []string{}
	for _, text := range texts {
		if !utf8.ValidString(text) {
			return Collection{}, &Error{Code: "INVALID_TEXT", Message: "invalid UTF-8"}
		}
		key := r.normalize.transform(text)
		if _, ok := digests[key]; !ok {
			digests[key] = r.digest(key)
			names = append(names, key)
		}
	}
	sort.Slice(names, func(i, j int) bool { return bytes.Compare(digests[names[i]], digests[names[j]]) < 0 })
	size := len(names)
	for name, p := range pinned {
		if !utf8.ValidString(name) || math.IsNaN(p.HueFraction) || p.HueFraction < 0 || p.HueFraction >= 1 || p.Ring < 0 {
			return Collection{}, invalid("pinned")
		}
		key := r.normalize.transform(name)
		if _, ok := result.Assignments[key]; ok {
			return Collection{}, invalid("duplicate normalized pin")
		}
		if _, ok := digests[key]; !ok {
			size++
		}
		result.Assignments[key] = p
	}
	for _, name := range names {
		if _, ok := result.Assignments[name]; ok {
			continue
		}
		if _, brand := r.brand.selectBrand(name, digests[name]); brand != nil {
			result.Assignments[name] = Assignment{HueFraction: fixedFraction(brand[0])}
		}
	}
	sep := math.Min(1.0/12, math.Max(1.0/24, 1/float64(size)))
	unique := map[string]bool{}
	report := AssignmentReport{ClosestPairs: [][2]string{}, WithinRingCapacity: size <= 5*int(math.Floor(1/sep))}
	points := make([]triple, len(names))
	var occupied [][2]triple
	for name, p := range result.Assignments {
		occupied = append(occupied, fillPair(r.render(r.digest(name), &p, name)))
	}
	for i, name := range names {
		digest := digests[name]
		p, ok := result.Assignments[name]
		if !ok {
			p = place(float64(binary.BigEndian.Uint32(digest))/4294967296, result.Assignments, sep)
		}
		color := r.render(digest, &p, name)
		pair := fillPair(color)
		if !ok {
			initial := p
			best := separationScore(pair, occupied)
			for step := 1; step < 120 && best < 0.04; step++ {
				hue := math.Mod(initial.HueFraction+float64(step%24)/24, 1)
				ring := initial.Ring + step/24
				free := true
				for _, previous := range result.Assignments {
					d := math.Abs(hue - previous.HueFraction)
					if previous.Ring == ring && math.Min(d, 1-d) < sep {
						free = false
						break
					}
				}
				if !free {
					continue
				}
				candidate := Assignment{hue, ring, true}
				rendered := r.render(digest, &candidate, name)
				projected := fillPair(rendered)
				if score := separationScore(projected, occupied); score > best {
					p, color, pair, best = candidate, rendered, projected, score
				}
			}
			result.Assignments[name] = p
			occupied = append(occupied, pair)
		}
		result.Colors[name] = color
		unique[color.Light.Fill.Hex] = true
		points[i] = pair[0]
	}
	for i, a := range points {
		for j := i + 1; j < len(points); j++ {
			b := points[j]
			distance := math.Hypot(a[0]-b[0], math.Hypot(a[1]-b[1], a[2]-b[2]))
			if report.MinDistance == nil || distance < *report.MinDistance {
				report.MinDistance = &distance
				report.ClosestPairs = nil
			}
			if distance == *report.MinDistance {
				report.ClosestPairs = append(report.ClosestPairs, [2]string{names[i], names[j]})
			}
		}
	}
	report.DistinctFills = len(unique) == len(names)
	result.Report = report
	return result, nil
}
