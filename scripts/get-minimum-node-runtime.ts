/*
 * This script is used github workflows to ensure that they run on the minimum version
 * allowed in the package JSON. This centralizes node version control.
 */

import { readFileSync } from 'node:fs';

/** Gets the Node.JS runtime range declared by the package. */
const runtimeRange = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).devEngines?.runtime?.version;
if (typeof runtimeRange !== 'string') {
    throw new TypeError('package.json must declare devEngines.runtime.version.');
}

/** Gets the minimum complete semantic version within the declared range. */
const minimumRuntime = runtimeRange.match(/\d+\.\d+\.\d+/)?.[0];
if (!minimumRuntime) {
    throw new TypeError(`Unable to determine a minimum Node.JS runtime from "${ runtimeRange }".`);
}

process.stdout.write(minimumRuntime);
