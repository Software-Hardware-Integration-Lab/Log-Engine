import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PYPI_URL = 'https://pypi.org/pypi/socketsecurity/json';
const RELEASE_AGE_MILLISECONDS = 24 * 60 * 60 * 1000;
const workflowPath = fileURLToPath(new URL('../.github/workflows/Security-Reachability.yml', import.meta.url));
const versionPattern = /^\d+(?:\.\d+)*$/u;
const pinPattern = /socketsecurity==(?<version>\d+(?:\.\d+)*)/gu;

const compareVersions = (left, right) => {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    const partCount = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < partCount; index += 1) {
        const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

        if (difference !== 0) {
            return difference;
        }
    }

    return 0;
};

const response = await fetch(PYPI_URL);

if (!response.ok) {
    throw new Error(`Unable to retrieve socketsecurity releases from PyPI: ${ response.status } ${ response.statusText }`);
}

const { releases } = await response.json();
const cutoffTime = Date.now() - RELEASE_AGE_MILLISECONDS;
const eligibleRelease = Object.entries(releases)
    .filter(([version, files]) => versionPattern.test(version) && Array.isArray(files) && files.length > 0 && files.every((file) => !file.yanked))
    .map(([version, files]) => {
        const mostRecentUpload = Math.max(...files.map((file) => Date.parse(file.upload_time_iso_8601)));

        return {
            'mostRecentUpload': mostRecentUpload,
            'version': version
        };
    })
    .filter(({ mostRecentUpload }) => Number.isFinite(mostRecentUpload) && mostRecentUpload <= cutoffTime)
    .sort((left, right) => compareVersions(right.version, left.version))[0];

if (!eligibleRelease) {
    throw new Error('PyPI did not return a non-yanked stable socketsecurity release at least 24 hours old.');
}

const workflow = await readFile(workflowPath, 'utf8');
const pins = [...workflow.matchAll(pinPattern)];

if (pins.length !== 1) {
    throw new Error(`Expected exactly one socketsecurity pin in ${ workflowPath }, found ${ pins.length }.`);
}

const currentVersion = pins[0].groups.version;

if (currentVersion === eligibleRelease.version) {
    process.stdout.write(`Reachability pin is current: socketsecurity==${ currentVersion }\n`);
} else {
    const updatedWorkflow = workflow.replace(pinPattern, `socketsecurity==${ eligibleRelease.version }`);

    await writeFile(workflowPath, updatedWorkflow);
    process.stdout.write(`Updated reachability pin: socketsecurity==${ currentVersion } -> socketsecurity==${ eligibleRelease.version }\n`);
}
