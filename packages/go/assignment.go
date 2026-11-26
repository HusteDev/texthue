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
	Ring        int64   `json:"ring"`
	Moved       bool    `json:"moved"`
}

type AssignmentReport struct {
	Searches           []PlacementSearch `json:"searches,omitempty"`
	MinDistance        *float64          `json:"minDistance"`
	ClosestPairs       [][2]string       `json:"closestPairs"`
	WithinRingCapacity bool              `json:"withinRingCapacity"`
	DistinctFills      bool              `json:"distinctFills"`
}

// AssignmentOptions controls presentation and scoring without changing identity.
type AssignmentOptions struct {
	Pinned  map[string]Assignment
	Markers bool
	Vision  []string
}

type PlacementSearch struct {
	Label               string   `json:"label"`
	PositionsConsidered int      `json:"positionsConsidered"`
	ColorsEvaluated     int      `json:"colorsEvaluated"`
	BestDistance        *float64 `json:"bestDistance"`
}

type Collection struct {
	ColorsByInput map[string]ColorSet   `json:"colorsByInput"`
	Markers       map[string]string     `json:"markers,omitempty"`
	Colors        map[string]ColorSet   `json:"colors"`
	Assignments   map[string]Assignment `json:"assignments"`
	Report        AssignmentReport      `json:"report"`
}

func visionPoint(rgb RGB, profile string) triple {
	color := encodedRGB{float64(rgb.R), float64(rgb.G), float64(rgb.B)}
	if transform, simulate := visionMatrices[profile]; simulate {
		linear := multiply(transform, triple{decode(color[0] / 255), decode(color[1] / 255), decode(color[2] / 255)})
		for i, channel := range linear {
			color[i] = math.Floor(float64(255*encode(math.Max(0, math.Min(1, channel)))) + .5)
		}
	}
	return encodedOKLab(color, rgbToXYZ)
}

func fillPoints(color ColorSet, profiles []string) []triple {
	points := make([]triple, 0, 2*len(profiles))
	for _, profile := range profiles {
		points = append(points, visionPoint(color.Light.Fill.RGB, profile), visionPoint(color.Dark.Fill.RGB, profile))
	}
	return points
}

func separationScore(pair []triple, occupied [][]triple) float64 {
	best := math.Inf(1)
	for _, previous := range occupied {
		for i, a := range pair {
			b := previous[i]
			best = math.Min(best, math.Hypot(a[0]-b[0], math.Hypot(a[1]-b[1], a[2]-b[2])))
		}
	}
	return best
}

func place(natural float64, occupied map[string]Assignment, separation float64, size int) Assignment {
	if size <= 8 && len(occupied) > 0 {
		best, chosen := -1.0, natural
		for step := 0; step < 24; step++ {
			hue := math.Mod(natural+float64(step)/24, 1)
			distance := math.Inf(1)
			for _, previous := range occupied {
				delta := math.Abs(previous.HueFraction - hue)
				distance = math.Min(distance, math.Min(delta, 1-delta))
			}
			if distance > best {
				best, chosen = distance, hue
			}
		}
		return Assignment{chosen, 0, chosen != natural}
	}
	for ring := int64(0); ; ring++ {
		for i := 0; i <= 384; i++ {
			step := (i + 1) / 2
			if i%2 != 0 {
				step = -step
			}
			hue := natural + float64(float64(step)*(separation/4))
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
	return r.AssignWithOptions(texts, AssignmentOptions{Pinned: pinned})
}

func (r *Resolver) AssignWithOptions(texts []string, options AssignmentOptions) (Collection, error) {
	profiles := options.Vision
	vision := profiles != nil
	if vision && len(profiles) == 0 {
		return Collection{}, invalid("empty vision profile list")
	}
	for _, profile := range profiles {
		if _, known := visionMatrices[profile]; !known && profile != "normal" {
			return Collection{}, invalid("unknown vision profile")
		}
	}
	if !vision {
		profiles = []string{"normal"}
	}
	result := Collection{Colors: map[string]ColorSet{}, ColorsByInput: map[string]ColorSet{}, Assignments: map[string]Assignment{}}
	if options.Markers {
		result.Markers = map[string]string{}
	}
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
	for name, p := range options.Pinned {
		if !utf8.ValidString(name) || !p.valid() {
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
	var occupied [][]triple
	for name, p := range result.Assignments {
		occupied = append(occupied, fillPoints(r.render(r.digest(name), &p, name), profiles))
	}
	for i, name := range names {
		digest := digests[name]
		p, ok := result.Assignments[name]
		if !ok {
			p = place(float64(binary.BigEndian.Uint32(digest))/4294967296, result.Assignments, sep, size)
		}
		color := r.render(digest, &p, name)
		pair := fillPoints(color, profiles)
		if !ok {
			initial := p
			best := separationScore(pair, occupied)
			limit, considered, evaluated := 120, 1, 1
			if vision {
				limit = 24
			}
			for step := 1; step < limit && !math.IsInf(best, 1) && (vision || best < .04); step++ {
				considered++
				hue := math.Mod(initial.HueFraction+float64(step%24)/24, 1)
				ring := initial.Ring + int64(step/24)
				if vision {
					ring = initial.Ring + int64(step%5)
				}
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
				evaluated++
				candidate := Assignment{hue, ring, true}
				rendered := r.render(digest, &candidate, name)
				projected := fillPoints(rendered, profiles)
				if score := separationScore(projected, occupied); score > best {
					p, color, pair, best = candidate, rendered, projected, score
				}
			}
			if vision {
				search := PlacementSearch{Label: name, PositionsConsidered: considered, ColorsEvaluated: evaluated}
				if !math.IsInf(best, 1) {
					search.BestDistance = &best
				}
				report.Searches = append(report.Searches, search)
			}
			result.Assignments[name] = p
			occupied = append(occupied, pair)
		}
		result.Colors[name] = color
		unique[color.Light.Fill.Hex] = true
		points[i] = pair[0]
		if vision {
			points[i] = visionPoint(color.Light.Fill.RGB, "normal")
		}
		if options.Markers {
			result.Markers[name] = markerShapes[int(digest[31])%len(markerShapes)]
		}
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
	for _, text := range texts {
		result.ColorsByInput[text] = result.Colors[r.normalize.transform(text)]
	}
	result.Report = report
	return result, nil
}
