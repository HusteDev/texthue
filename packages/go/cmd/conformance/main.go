// Command conformance is the Go side of the cross-language parity test.
//
// It reads a JSON array of {"text": string, "options": object} cases from
// standard input, resolves each with ParseOptions and Resolve, and writes the
// JSON array of ColorSet results to standard output. Any error stops the run
// with a nonzero exit status. It is a test fixture, not an end-user command.
package main

import (
	"encoding/json"
	"fmt"
	texthue "github.com/HusteDev/texthue/packages/go"
	"os"
)

// run decodes the cases, resolves them in order, and encodes the results.
func run() error {
	var cases []struct {
		Config  json.RawMessage               `json:"config"`
		Texts   []string                      `json:"texts"`
		Pinned  map[string]texthue.Assignment `json:"pinned"`
		Text    string                        `json:"text"`
		Options json.RawMessage               `json:"options"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		return err
	}
	results := make([]any, 0, len(cases))
	for _, item := range cases {
		if item.Config != nil {
			resolver, err := texthue.ImportConfig(item.Config)
			if err != nil {
				return err
			}
			colors, err := resolver.Resolve(item.Text)
			if err != nil {
				return err
			}
			results = append(results, colors)
			continue
		}
		if item.Options == nil {
			item.Options = json.RawMessage("{}")
		}
		options, err := texthue.ParseOptions(item.Options)
		if err != nil {
			return err
		}
		if item.Texts != nil {
			resolver, err := texthue.NewResolver(options...)
			if err != nil {
				return err
			}
			result, err := resolver.Assign(item.Texts, item.Pinned)
			if err != nil {
				return err
			}
			results = append(results, result)
			continue
		}
		result, err := texthue.Resolve(item.Text, options...)
		if err != nil {
			return err
		}
		results = append(results, result)
	}
	return json.NewEncoder(os.Stdout).Encode(results)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
