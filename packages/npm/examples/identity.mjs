import assert from 'node:assert/strict';
import { createResolver } from 'texthue';

const exact = createResolver();
const canonical = createResolver({ normalize: { unicode: 'NFC' } });
const composed = '\u00e9';
const decomposed = 'e\u0301';
assert.notEqual(exact.identity(composed), exact.identity(decomposed));
assert.deepEqual(canonical.resolve(composed), canonical.resolve(decomposed));

const projects = createResolver({ namespace: 'projects' });
const labels = createResolver({ namespace: 'labels' });
const fill = { theme: 'light', role: 'fill' };
assert.notEqual(projects.hex('42', fill), labels.hex('42', fill));
console.log('Project and label fills:', projects.hex('42', fill), labels.hex('42', fill));
