import { spawnSync } from 'node:child_process';

/** Represents the package metadata produced by npm pack. */
interface PackageEntry {
    /** Gets files included in the package tarball. */
    'files'?: {
        /** Gets the file path inside the tarball. */
        'path': string;
    }[];
}

/** Represents supported npm pack JSON response shapes. */
type PackageMetadata = PackageEntry[] | Record<string, PackageEntry>;

/** Indicates whether the script is running on Windows. */
const isWindows = process.platform === 'win32';
/** Gets the executable used to invoke npm. */
const npmExecutable = isWindows ? process.env['ComSpec'] ?? 'cmd.exe' : 'npm';
/** Gets the arguments used to request JSON tarball metadata. */
const npmArguments = isWindows
    ? ['/d', '/s', '/c', 'npm pack --dry-run --json --ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
/** Gets the npm pack process result. */
const packageResult = spawnSync(npmExecutable, npmArguments, {
    'cwd': process.cwd(),
    'encoding': 'utf8'
});
if (packageResult.error) {
    throw packageResult.error;
}
if (packageResult.status !== 0) {
    process.stderr.write(packageResult.stderr);
    process.exit(packageResult.status ?? 1);
}
/** Gets the parsed npm pack metadata. */
const packageMetadata = JSON.parse(packageResult.stdout) as PackageMetadata;
/*
 * `npm pack --dry-run --json` has returned an array of package metadata objects on older npm
 * versions, but newer npm versions instead return an object keyed by package name. Support both
 * shapes so this script doesn't silently misreport missing files when npm's output format changes.
 */
/** Gets the package metadata entry. */
const [packageEntry] = Array.isArray(packageMetadata) ? packageMetadata : Object.values(packageMetadata);
/** Gets all package tarball file paths. */
const packageFiles = packageEntry?.files?.map((file) => file.path) ?? [];
/** Lists files required in every published package. */
const requiredFiles = ['LICENSE', 'README.md', 'package.json'];
/** Gets unexpected files included in the tarball. */
const invalidFiles = packageFiles.filter((file) => !requiredFiles.includes(file) && !file.startsWith('bin/'));
/** Gets required files missing from the tarball. */
const missingFiles = requiredFiles.filter((file) => !packageFiles.includes(file));
if (invalidFiles.length > 0 || missingFiles.length > 0) {
    if (invalidFiles.length > 0) {
        process.stderr.write(`Unexpected files in package tarball:\n${ invalidFiles.map((file) => `- ${ file }`).join('\n') }\n`);
    }
    if (missingFiles.length > 0) {
        process.stderr.write(`Required files missing from package tarball:\n${ missingFiles.map((file) => `- ${ file }`).join('\n') }\n`);
    }
    process.exitCode = 1;
}
else {
    process.stdout.write(`Package tarball validation passed (${ packageFiles.length } files).\n`);
}
