"""Resolve one string and print every role in every output format for both themes."""

from texthue import resolve_text_colors

colors = resolve_text_colors("research")
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
