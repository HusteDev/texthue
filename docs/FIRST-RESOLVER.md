# Configure your first resolver

## What does configuring a resolver mean?

Imagine a task board where each assignee has a colored name badge. Your application supplies a username and TextHue returns colors for drawing that badge in both themes. A **resolver** is the object you call to do that calculation. **Configuring** it means choosing the rules once when you create the object, then reusing it for every assignee. Everything runs inside your application.

For a single badge with default settings, the one-call helper is enough. Create a resolver when several screens or labels should follow the same rules. You can create one at application startup or at module scope and pass it to the code that draws badges.

## Build an assignee badge

Use a stable username as the input. This example sets one option, `namespace`, to `assignees`. The namespace is part of the calculation: a chat app and task board using the same username, namespace, algorithm and settings get the same colors. A team that wants independent colors for project names can use a separate resolver with namespace `projects`.

For installation commands, start with [Packages and installation](PACKAGES.md).

Each program below creates **one** resolver, uses it for two users, and resolves the first user again. It prints the username, then the light-theme badge background, the light-theme lettering, and the dark-theme badge background. Pick the example for your language.

### JavaScript and TypeScript

In a Node project with TextHue installed, save this as `badges.mjs` and run `node badges.mjs`.

```js
import {createResolver} from 'texthue';

const resolver = createResolver({namespace: 'assignees'});
for (const user of ['@mira', '@nico', '@mira']) {
  const {light, dark} = resolver.resolve(user);
  console.log(user, light.fill.hex, light.onFill.hex, dark.fill.hex);
}
```

### Python

In the environment where you installed TextHue, save this as `badges.py` and run `python badges.py`.

```python
from texthue import Resolver

resolver = Resolver(namespace="assignees")
for user in ("@mira", "@nico", "@mira"):
    colors = resolver.resolve(user)
    print(user, colors.light.fill.hex, colors.light.on_fill.hex, colors.dark.fill.hex)
```

### Go

In a Go module that depends on TextHue, save this as `main.go` and run `go run main.go`. Check the error from construction so an invalid configuration is caught before drawing any badges.

```go
package main

import (
    "fmt"
    "log"

    texthue "github.com/HusteDev/texthue/packages/go"
)

func main() {
    resolver, err := texthue.NewResolver(texthue.WithNamespace("assignees"))
    if err != nil {
        log.Fatal(err)
    }
    for _, user := range []string{"@mira", "@nico", "@mira"} {
        colors, err := resolver.Resolve(user)
        if err != nil {
            log.Fatal(err)
        }
        fmt.Println(user, colors.Light.Fill.Hex, colors.Light.OnFill.Hex, colors.Dark.Fill.Hex)
    }
}
```

## Read the output

```text
@mira #a79de9 #000000 #4f369d
@nico #ec9d89 #000000 #8b3a26
@mira #a79de9 #000000 #4f369d
```

The first and third lines match. Looking up Nico in between has no effect on Mira. In your UI, paint the badge with `fill` and its lettering with `onFill` from the **same theme**. A dark-theme badge needs its dark-theme lettering as well.

## Change one setting

Replace `assignees` with `projects` in the constructor and run the same program. Compare Mira’s first line with the output above. Then change it back. This illustrates why two apps that share username colors should agree on the namespace as well as the username.

If you need neighboring series to be distinguishable, pass all their names together using [collection assignment](COLORS.md#assigning-a-collection). If adding a series should preserve earlier placements, follow [Restore a registry and add a label](GUIDE.md#restore-a-registry-and-add-a-label). For a particular setting, go to the [configuration reference](CONFIGURATION.md).

## Run a roster through three sessions

[Clean-install quickstarts and runnable source](https://github.com/HusteDev/texthue/tree/main/examples/roster). Start with Mira and Lee, replace Lee with Nico, then bring Lee back. Compare the username badge color with the assigned board color and inspect the saved registry between runs.
