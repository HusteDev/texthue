import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';

export function runRoster(update) {
  const labels = process.argv.slice(2);
  if (!labels.length) throw new Error('Pass one or more usernames');
  const path = 'roster.json';
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(`${path}.tmp`, update(labels, previous));
  renameSync(`${path}.tmp`, path);
}
