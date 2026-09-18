import { spawnSync } from 'node:child_process';

/** Indicates whether the script is running on Windows. */
const isWindows = process.platform === 'win32';
/** Gets the executable used to invoke npm. */
const npmExecutable = isWindows ? process.env['ComSpec'] ?? 'cmd.exe' : 'npm';
/** Gets the arguments used to verify package signatures. */
const npmArguments = isWindows
    ? ['/d', '/s', '/c', 'npm audit signatures']
    : ['audit', 'signatures'];
/** Gets the signature audit result. */
const auditResult = spawnSync(npmExecutable, npmArguments, {
    'cwd': process.cwd(),
    'stdio': 'inherit'
});
if (auditResult.error) {
    throw auditResult.error;
}
if (auditResult.status !== 0) {
    process.stderr.write(
        '\nPackage signature audit failed. Delete node_modules and regenerate package-lock.json, then try again.\n'
    );
    process.exit(auditResult.status ?? 1);
}
