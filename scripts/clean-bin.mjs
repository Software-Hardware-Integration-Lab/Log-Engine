import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const binDirectory = fileURLToPath(new URL('../bin', import.meta.url));

await rm(binDirectory, {
    'force': true,
    'recursive': true
});
