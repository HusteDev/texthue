"""Resolve one label and inspect the fill in both themes."""

from texthue import Resolver

colors = Resolver().resolve("research")
assert (colors.light.fill.hex, colors.dark.fill.hex) == ("#59b8d8", "#255464")
print("Algorithm:", colors.version)
for name in ("light", "dark"):
    theme = getattr(colors, name)
    color = theme.fill
    rgb, hsl, oklch = color.rgb, color.hsl, color.oklch
    print(
        name,
        {
            "hex": color.hex,
            "rgb": f"rgb({rgb.r} {rgb.g} {rgb.b})",
            "hsl": f"hsl({hsl.h} {hsl.s}% {hsl.l}%)",
            "oklch": f"oklch({oklch.l} {oklch.c} {oklch.h})",
            "onFill": theme.on_fill.hex,
            "text": theme.text.hex,
            "background": theme.background.hex,
        },
    )
