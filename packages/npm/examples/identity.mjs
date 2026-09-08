// Show that text is used exactly as given, that namespaces separate domains,
// and that a stable identifier always maps to the same colors.
import { resolveTextColors } from 'texthue';

for (const text of ['research', 'Research', 'research ', '\u00e9', 'e\u0301']) {
  console.log(JSON.stringify(text), (await resolveTextColors(text)).light.fill.hex);
}
const composed = await resolveTextColors('\u00e9'.normalize('NFC'));
const decomposed = await resolveTextColors('e\u0301'.normalize('NFC'));
console.log('Caller-selected NFC normalization matches:', composed.light.fill.hex === decomposed.light.fill.hex);

const labels = await resolveTextColors('42', { namespace: 'labels' });
const projects = await resolveTextColors('42', { namespace: 'projects' });
console.log('Namespace mappings:', labels.light.fill.hex, projects.light.fill.hex);

// Persist the stable item ID and complete settings to preserve its assignment.
const options = { namespace: 'projects' };
const first = await resolveTextColors('project-id:42', options);
const second = await resolveTextColors('project-id:42', options);
console.log('Repeated assignment matches:', first.light.fill.hex === second.light.fill.hex);
