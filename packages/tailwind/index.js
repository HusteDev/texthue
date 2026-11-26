import {createResolver, cssVariables, TextColorError} from 'texthue';

/** Generate a Tailwind theme.extend.colors object for a known collection of labels. */
export function labelColors(labels, options = {}, theme = 'light') {
  if (theme !== 'light' && theme !== 'dark') throw new TextColorError('INVALID_OPTIONS', 'Expected light or dark theme');
  const {colors} = createResolver(options).assign(labels);
  const tokens = Object.create(null);
  for (const [slug, set] of Object.entries(colors)) {
    for (const [variable, hex] of Object.entries(cssVariables(set, {slug, theme}))) {
      const token = variable.slice(2);
      if (Object.hasOwn(tokens, token)) throw new TextColorError('INVALID_OPTIONS', `Duplicate Tailwind color token: ${token}`);
      tokens[token] = hex;
    }
  }
  return tokens;
}

/** Build predictable light and dark tokens from caller-owned CSS aliases. */
export function namedLabelColors(aliases, options = {}) {
  if (!aliases || typeof aliases !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(aliases))) {
    throw new TextColorError('INVALID_OPTIONS', 'Expected a record of CSS aliases and labels');
  }
  const entries = Object.entries(aliases);
  for (const [alias] of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(alias)) throw new TextColorError('INVALID_OPTIONS', 'Invalid CSS alias');
  }
  const {colorsByInput} = createResolver(options).assign(entries.map(([, label]) => label));
  const tokens = Object.create(null);
  for (const [alias, label] of entries) {
    for (const theme of ['light', 'dark']) {
      for (const [role, color] of Object.entries(colorsByInput[label][theme])) {
        if ('hex' in color) {
          const roleName = role.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
          tokens[`texthue-${alias}-${theme}-${roleName}`] = color.hex;
        }
      }
    }
  }
  return tokens;
}
