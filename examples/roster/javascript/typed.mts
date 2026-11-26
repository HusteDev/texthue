import {runRoster} from './cli.mjs';
import {updateRoster} from './palette.mjs';

// This entry point uses the same roster and persistence code as the JavaScript CLI.
const update: (labels: string[], saved: string) => string = updateRoster;
runRoster(update);
