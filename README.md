# TextHue

TextHue turns a text label into repeatable colors for light and dark [themes](docs/GLOSSARY.md#theme-and-role). Use it for issue labels, avatars, or chart categories. An individual label keeps its colors across calls. When several labels appear together, [collection assignment](docs/GLOSSARY.md#collection-assignment-assigned) can move their colors farther apart.

[Try the live palette inspector](https://hustedev.github.io/texthue/site/?preview=2) · [Read the TextHue handbook](docs/FIRST-RESOLVER.md) · [Run the inspector locally](docs/GUIDE.md#preview-a-collection-in-the-palette-inspector)

**Pre-release.** Build from a source checkout. For JavaScript, run `npm ci` and `npm run build` at the repository root. For Python, run `python -m pip install ./packages/python`. The [roster examples](examples/roster/README.md) exercise these packages in a consumer project.

## One username across three apps

Follow `@mira` from the chat message to the task assignee and the on-call shift. Each app resolves the username independently. With the same TextHue version, settings, and [theme](docs/GLOSSARY.md#theme-and-role), each gets exactly the same badge colors. Adding another teammate leaves Mira’s badge unchanged.

![Chat messages, task cards, and calendar shifts show @mira and @nico with consistent username badges.](docs/assets/gallery.svg)

```js
import { createResolver } from 'texthue';

const users = createResolver();

function paintBadge(badge, username) {
  badge.textContent = username;
  badge.style.backgroundColor = users.hex(username, { theme: 'light', role: 'fill' });
  badge.style.color = users.hex(username, { theme: 'light', role: 'onFill' });
}

paintBadge(badge, '@mira');
```

## Start here

| What do you want to do? | Read |
| --- | --- |
| Run a roster across three sessions in a fresh project | [Clean-install quickstarts and runnable examples](examples/roster/README.md) |
| Build your first username badge in JavaScript, Python, or Go | [Configure your first resolver](docs/FIRST-RESOLVER.md) |
| Install TextHue or find your language | [Package list, install commands, and first calls](docs/PACKAGES.md) |
| Choose colors for a group of labels | [Independent colors and collection assignment, illustrated](docs/COLORS.md#assigning-a-collection) |
| Keep existing colors when labels change | [Restore a registry and add a label](docs/GUIDE.md#restore-a-registry-and-add-a-label) |
| Understand a term in the inspector | [Glossary](docs/GLOSSARY.md) |
| Check how a palette looks with different color vision | [Vision profiles, illustrated](docs/GUIDE.md#find-labels-that-need-another-visual-cue) |
| Configure brand colors, [contrast](docs/GLOSSARY.md#distance-and-contrast), or [gamut](docs/GLOSSARY.md#gamut-and-display-p3) | [Resolver configuration](docs/CONFIGURATION.md) |
| Develop or test an implementation | [Development guide](docs/DEVELOPMENT.md) and [algorithm specification](SPECIFICATION.md) |

## Sources and licensing

The project code is covered by [MIT](LICENSE); adapted W3C conversion code is covered by the [included W3C notice](THIRD_PARTY_NOTICES.md). Package metadata expresses both licenses. The [CSS Color 4 conversion algorithms](https://www.w3.org/TR/2026/CRD-css-color-4-20260901/#color-conversion-code) and [WCAG relative luminance definition](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) explain the underlying color and [contrast](docs/GLOSSARY.md#distance-and-contrast) calculations. The versioned local specification defines the implementation contract.
