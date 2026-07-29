import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmExecutable = isWindows ? process.env.ComSpec ?? 'cmd.exe' : 'npm';
const npmArguments = isWindows
    ? ['/d', '/s', '/c', 'npm pack --dry-run --json --ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
const packageResult = spawnSync(
    npmExecutable,
    npmArguments,
    {
        'cwd': process.cwd(),
        'encoding': 'utf8'
    }
);

if (packageResult.error) {
    throw packageResult.error;
}

if (packageResult.status !== 0) {
    process.stderr.write(packageResult.stderr);
    process.exit(packageResult.status ?? 1);
}

const packageMetadata = JSON.parse(packageResult.stdout);

/*
 * `npm pack --dry-run --json` has returned an array of package metadata objects on older npm
 * versions, but newer npm versions instead return an object keyed by package name. Support both
 * shapes so this script doesn't silently misreport missing files when npm's output format changes.
 */
const [packageEntry] = Array.isArray(packageMetadata) ? packageMetadata : Object.values(packageMetadata);
const packageFiles = packageEntry?.files?.map((file) => file.path) ?? [];
const requiredFiles = ['LICENSE', 'README.md', 'package.json'];
const invalidFiles = packageFiles.filter((file) =>
    !requiredFiles.includes(file) && !file.startsWith('bin/')
);
const missingFiles = requiredFiles.filter((file) => !packageFiles.includes(file));

if (invalidFiles.length > 0 || missingFiles.length > 0) {
    if (invalidFiles.length > 0) {
        process.stderr.write(`Unexpected files in package tarball:\n${ invalidFiles.map((file) => `- ${ file }`).join('\n') }\n`);
    }

    if (missingFiles.length > 0) {
        process.stderr.write(`Required files missing from package tarball:\n${ missingFiles.map((file) => `- ${ file }`).join('\n') }\n`);
    }

    process.exitCode = 1;
} else {
    process.stdout.write(`Package tarball validation passed (${ packageFiles.length } files).\n`);
}
