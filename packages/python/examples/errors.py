"""Show the stable error codes raised for invalid text and options."""

from texthue import TextColorError, resolve_text_colors

cases = [
    (123, {}),
    ("\ud800", {}),
    ("research", {"contrastTarget": 22}),
    ("research", {"backgrounds": {"light": "#fff"}}),
    ("research", {"profiles": {"light": {"fill": {"chromaScale": [0.2, 0.1]}}}}),
]
for text, options in cases:
    try:
        resolve_text_colors(text, options)
    except TextColorError as error:
        print(error.code, str(error))
    else:
        raise AssertionError("This intentionally invalid example should have failed")
