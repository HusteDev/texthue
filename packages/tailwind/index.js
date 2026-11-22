import {createResolver, cssVariables} from 'texthue';

/** Generate a Tailwind theme.extend.colors object for a known collection of labels. */
export function labelColors(labels, options = {}, theme = 'light') {
  if (theme !== 'light' && theme !== 'dark') throw new TypeError('Expected light or dark theme');
  const {colors} = createResolver(options).assign(labels);
  const tokens = Object.create(null);
  for (const [slug, set] of Object.entries(colors)) {
    for (const [variable, hex] of Object.entries(cssVariables(set, {slug, theme}))) {
      const token = variable.slice(2);
      if (Object.hasOwn(tokens, token)) throw new Error(`Duplicate Tailwind color token: ${token}`);
      tokens[token] = hex;
    }
  }
  return tokens;
}
