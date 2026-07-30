import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { doesFileExist } from '#/helpers/FileHelpers.js';

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { 'force': true,
        'recursive': true })));
});

describe('doesFileExist', () => {
    it('should return true when the file exists and false when it is absent', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'log-engine-test-'));

        directories.push(directory);

        const existing = join(directory, 'exists.txt');

        await writeFile(existing, 'exists');

        await expect(doesFileExist(existing)).resolves.toBe(true);

        await expect(doesFileExist(join(directory, 'missing.txt'))).resolves.toBe(false);
    });
});
