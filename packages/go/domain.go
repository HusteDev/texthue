package texthue

import "math"

type hueDomain struct {
	arcs  []Range
	width float64
}

func compileHueDomain(allowed *Range, excluded []Range) (hueDomain, error) {
	split := func(arc Range) ([]Range, error) {
		for _, x := range arc {
			if math.IsNaN(x) || x < 0 || x > 360 {
				return nil, invalid("hue interval")
			}
		}
		if arc[0] <= arc[1] {
			return []Range{arc}, nil
		}
		return []Range{{0, arc[1]}, {arc[0], 360}}, nil
	}
	bounds := Range{0, 360}
	if allowed != nil {
		bounds = *allowed
	}
	arcs, err := split(bounds)
	if err != nil {
		return hueDomain{}, err
	}
	if len(excluded) > 16 {
		return hueDomain{}, invalid("excludeHues")
	}
	for _, interval := range excluded {
		cuts, err := split(interval)
		if err != nil {
			return hueDomain{}, err
		}
		for _, cut := range cuts {
			next := []Range{}
			for _, arc := range arcs {
				for _, piece := range []Range{{arc[0], math.Min(arc[1], cut[0])}, {math.Max(arc[0], cut[1]), arc[1]}} {
					if piece[0] < piece[1] {
						next = append(next, piece)
					}
				}
			}
			arcs = next
		}
	}
	width := 0.0
	for _, arc := range arcs {
		width += arc[1] - arc[0]
	}
	if width == 0 {
		return hueDomain{}, invalid("empty hue domain")
	}
	return hueDomain{arcs, width}, nil
}

func (d hueDomain) mapHue(h float64) float64 {
	if d.width == 360 {
		return h
	}
	distance := h / 360 * d.width
	for _, arc := range d.arcs {
		width := arc[1] - arc[0]
		if distance < width {
			return arc[0] + distance
		}
		distance -= width
	}
	return d.arcs[0][0]
}
