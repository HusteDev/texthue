package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"

	texthue "github.com/HusteDev/texthue/packages/go"
)

type snapshot struct {
	Config   json.RawMessage `json:"config"`
	Registry json.RawMessage `json:"registry"`
}

func run(labels []string) error {
	if len(labels) == 0 {
		return errors.New("pass one or more usernames")
	}
	const path = "roster.json"
	var resolver *texthue.Resolver
	var pins map[string]texthue.Assignment
	raw, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		resolver, err = texthue.NewResolver(texthue.WithNamespace("assignees"))
	case err == nil:
		var saved snapshot
		if err := json.Unmarshal(raw, &saved); err != nil {
			return err
		}
		resolver, err = texthue.ImportConfig(saved.Config)
		if err != nil {
			return err
		}
		pins, err = resolver.ImportRegistry(saved.Registry)
	}
	if err != nil {
		return err
	}
	board, err := resolver.Assign(labels, pins)
	if err != nil {
		return err
	}
	for _, label := range labels {
		colors, err := resolver.Resolve(label)
		if err != nil {
			return err
		}
		fmt.Println(label, colors.Light.Fill.Hex, colors.Light.OnFill.Hex, board.Colors[label].Light.Fill.Hex)
	}
	config, err := resolver.ExportConfig()
	if err != nil {
		return err
	}
	registry, err := resolver.ExportRegistry(board.Assignments)
	if err != nil {
		return err
	}
	raw, err = json.Marshal(snapshot{config, registry})
	if err != nil {
		return err
	}
	if err := os.WriteFile(path+".tmp", raw, 0600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
