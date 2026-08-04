import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
/** Specifies the PyPI endpoint for socketsecurity releases. */
const PYPI_URL = 'https://pypi.org/pypi/socketsecurity/json';
/** Specifies the minimum release age before a version is eligible. */
const RELEASE_AGE_MILLISECONDS = 24 * 60 * 60 * 1000;
/** Gets the workflow containing the socketsecurity pin. */
const workflowPath = fileURLToPath(new URL('../.github/workflows/Security-Reachability.yml', import.meta.url));
/** Matches stable numeric versions. */
const versionPattern = /^\d+(?:\.\d+)*$/u;
/** Matches the socketsecurity version pin in the workflow. */
const pinPattern = /socketsecurity==(?<version>\d+(?:\.\d+)*)/gu;
/**
 * Compares two numeric dotted version strings.
 * @param left Specifies the left version.
 * @param right Specifies the right version.
 * @returns A negative value, zero, or a positive value according to version ordering.
 */
function compareVersions(left, right) {
    /** Gets the numeric components of the left version. */
    const leftParts = left.split('.').map(Number);
    /** Gets the numeric components of the right version. */
    const rightParts = right.split('.').map(Number);
    /** Gets the number of components to compare. */
    const partCount = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < partCount; index += 1) {
        /** Gets the difference between components at the current position. */
        const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
}
/** Gets the PyPI response for socketsecurity releases. */
const response = await fetch(PYPI_URL);
if (!response.ok) {
    throw new Error(`Unable to retrieve socketsecurity releases from PyPI: ${response.status} ${response.statusText}`);
}
/** Gets release files indexed by socketsecurity version. */
const { releases } = await response.json();
/** Gets the latest timestamp at which a release is eligible. */
const cutoffTime = Date.now() - RELEASE_AGE_MILLISECONDS;
/** Gets the newest non-yanked stable releases old enough to use. */
const eligibleReleases = Object.entries(releases)
    .filter(([version, files]) => versionPattern.test(version) && Array.isArray(files) && files.length > 0 && files.every((file) => !file.yanked))
    .map(([version, files]) => {
    /** Gets the most recent upload time for the release. */
    const mostRecentUpload = Math.max(...files.map((file) => Date.parse(file.upload_time_iso_8601)));
    return {
        mostRecentUpload,
        version
    };
})
    .filter(({ mostRecentUpload }) => Number.isFinite(mostRecentUpload) && mostRecentUpload <= cutoffTime)
    .sort((left, right) => compareVersions(right.version, left.version));
/** Gets the newest eligible release. */
const [latestEligibleRelease] = eligibleReleases;
if (!latestEligibleRelease) {
    throw new Error('PyPI did not return a non-yanked stable socketsecurity release at least 24 hours old.');
}
/** Gets the workflow content. */
const workflow = await readFile(workflowPath, 'utf8');
/** Gets all socketsecurity pins in the workflow. */
const pins = [...workflow.matchAll(pinPattern)];
if (pins.length !== 1) {
    throw new Error(`Expected exactly one socketsecurity pin in ${workflowPath}, found ${pins.length}.`);
}
/** Gets the socketsecurity version captured from the workflow pin. */
const currentVersion = pins[0]?.groups?.['version'];
if (!currentVersion) {
    throw new Error(`Unable to extract the socketsecurity version from ${workflowPath}.`);
}
if (currentVersion === latestEligibleRelease.version) {
    process.stdout.write(`Reachability pin is current: socketsecurity==${currentVersion}\n`);
}
else {
    /** Gets the workflow content with the updated socketsecurity pin. */
    const updatedWorkflow = workflow.replace(pinPattern, `socketsecurity==${latestEligibleRelease.version}`);
    await writeFile(workflowPath, updatedWorkflow);
    process.stdout.write(`Updated reachability pin: socketsecurity==${currentVersion} -> socketsecurity==${latestEligibleRelease.version}\n`);
}
