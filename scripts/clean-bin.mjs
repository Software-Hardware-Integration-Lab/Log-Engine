import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
/** Gets the bin directory path relative to this script's location. */
const binDirectory = fileURLToPath(new URL('../bin', import.meta.url));
// Remove the bin directory and its contents
await rm(binDirectory, {
    // Force deletion even if the directory is not empty
    'force': true,
    // Remove directories and their contents recursively
    'recursive': true
});
