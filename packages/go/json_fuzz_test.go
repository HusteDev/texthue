package texthue

import (
	"encoding/json"
	"fmt"
	"testing"
	"unicode/utf8"
)

// Generate escaped UTF-16 pairs, with arbitrary surrounding string content.
// The expected result follows the scalar-value rules independently of the scanner.
func FuzzJSONUnicode(f *testing.F) {
	f.Add("label", uint16(0xd83d), uint16(0xde00))
	f.Add("quoted \" and \\", uint16(0xdc00), uint16(0x41))
	f.Add("", uint16(0x41), uint16(0xdbff))
	f.Fuzz(func(t *testing.T, prefix string, a, b uint16) {
		if !utf8.ValidString(prefix) {
			if validJSONUnicode([]byte(prefix)) {
				t.Fatal("accepted malformed UTF-8")
			}
			return
		}
		quoted, err := json.Marshal(prefix)
		if err != nil {
			t.Fatal(err)
		}
		data := fmt.Appendf(quoted[:len(quoted)-1], `\u%04x\u%04x"`, a, b)
		surrogate := func(v uint16) bool { return v >= 0xd800 && v <= 0xdfff }
		want := (!surrogate(a) && !surrogate(b)) || (a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff)
		if got := validJSONUnicode(data); got != want {
			t.Fatalf("units %04x %04x: got %t, want %t", a, b, got, want)
		}
	})
}
