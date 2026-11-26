package texthue

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"math"
	"sort"
)

// fingerprint accepts the JSON representation of already validated configuration.
func fingerprint(value any) (string, error) {
	return fingerprintDomain(value, "texthue-config-v1")
}

func fingerprintDomain(value any, domain string) (string, error) {
	digest := sha256.New()
	digest.Write([]byte(domain + "\x00"))
	count := func(n int) error {
		if uint64(n) > math.MaxUint32 {
			return invalid("configuration length")
		}
		digest.Write(binary.BigEndian.AppendUint32(nil, uint32(n)))
		return nil
	}
	var write func(any) error
	write = func(item any) error {
		switch v := item.(type) {
		case float64:
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return invalid("configuration number")
			}
			if v == 0 {
				v = 0
			}
			digest.Write(binary.BigEndian.AppendUint64([]byte{1}, math.Float64bits(v)))
		case string:
			digest.Write([]byte{2})
			if err := count(len(v)); err != nil {
				return err
			}
			digest.Write([]byte(v))
		case []any:
			digest.Write([]byte{3})
			if err := count(len(v)); err != nil {
				return err
			}
			for _, child := range v {
				if err := write(child); err != nil {
					return err
				}
			}
		case map[string]any:
			digest.Write([]byte{4})
			if err := count(len(v)); err != nil {
				return err
			}
			keys := make([]string, 0, len(v))
			for key := range v {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				if err := write(key); err != nil {
					return err
				}
				if err := write(v[key]); err != nil {
					return err
				}
			}
		default:
			return invalid("configuration value")
		}
		return nil
	}
	if err := write(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}
