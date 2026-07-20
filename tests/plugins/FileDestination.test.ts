import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileDestination } from '#/plugins/FileDestination.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';

const directories: string[] = [];

const uuid = '00000000-0000-0000-0000-000000000001';

const now = new Date('2025-01-02T03:04:05.678Z');

const operational: OperationalLog = {
    'additionalContext': 4,
    'correlationId': uuid,
    'level': LogLevel.Information,
    'message': 'written',
    'requestId': void 0,
    'stack': void 0,
    'tenantId': void 0,
    'timeGenerated': now,
    'userId': 'user'
};

const audit: AuditLog = {
    'after': 'new',
    'before': 'old',
    'category': 'Update',
    'correlationId': uuid,
    'message': 'audited',
    'requestId': void 0,
    'tenantId': void 0,
    'timeGenerated': now,
    'userId': 'user'
};

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'log-engine-test-'));

    directories.push(directory);

    return directory;
}

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {
        'force': true,
        'recursive': true
    })));
});

describe('FileDestination', () => {
    it('should write operational and audit entries to every configured file format', async () => {
        const directory = await temporaryDirectory();

        const destination = await FileDestination.create({
            'outputDirectory': directory,
            'outputFormats': ['formattedLog', 'json'],
            'rotationIntervalMinutes': 60
        });

        expect(destination).not.toBeNull();

        await destination!.log(operational);

        await destination!.auditLog(audit);

        const filenames = await readdir(directory);

        expect(filenames).toEqual(expect.arrayContaining([
            expect.stringMatching(/^OP_.*\.jsonl$/u),
            expect.stringMatching(/^AUDIT_.*\.log$/u)
        ]));

        const operationalJson = filenames.find((name) => name.startsWith('OP_') && name.endsWith('.jsonl'));

        const auditText = filenames.find((name) => name.startsWith('AUDIT_') && name.endsWith('.log'));

        expect(operationalJson).toBeDefined();

        expect(auditText).toBeDefined();

        expect(JSON.parse(await readFile(join(directory, operationalJson!), 'utf8'))).toMatchObject({
            'level': 'Information',
            'message': 'written'
        });

        expect(await readFile(join(directory, auditText!), 'utf8')).toContain('[AUDIT][Update]');
    });

    it('should not create files when the stream-specific write predicate disables both streams', async () => {
        const directory = await temporaryDirectory();

        const destination = await FileDestination.create({
            'getShouldWriteAuditLogs': () => false,
            'getShouldWriteOperationalLogs': () => false,
            'outputDirectory': directory
        });

        await destination!.log(operational);

        await destination!.auditLog(audit);

        expect(await readdir(directory)).toEqual([]);
    });

    it('should use its supplied instance ID and stop cleanup when disposed', async () => {
        const handler = {
            'getCurrentLogFilePath': vi.fn(() => 'output'),
            'logToFile': vi.fn(() => Promise.resolve()),
            'startDeleteInterval': vi.fn(),
            'stopDeleteInterval': vi.fn()
        };

        const destination = await FileDestination.create({
            'id': 'audit-archive',
            'outputDirectory': await temporaryDirectory()
        }, {
            'createFileHandler': () => handler
        });

        expect(destination?.id).toBe('audit-archive');

        expect(handler.startDeleteInterval).toHaveBeenCalledOnce();

        destination?.dispose();

        expect(handler.stopDeleteInterval).toHaveBeenCalledOnce();
    });

    it('should return null and emit diagnostics when startup directory creation fails', async () => {
        const error = new Error('directory unavailable');

        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const destination = await FileDestination.create({
            'getShouldWriteDebugInfo': () => true,
            'outputDirectory': await temporaryDirectory()
        }, {
            'createDirectory': (): Promise<void> => Promise.reject(error)
        });

        expect(destination).toBeNull();

        expect(log).toHaveBeenCalledWith(expect.stringContaining('directory unavailable'));
    });

    it('should contain handler write failures and emit fallback diagnostics for both streams', async () => {
        const error = new Error('write failure');

        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const dir = vi.spyOn(console, 'dir').mockImplementation(() => void 0);

        const handler = {
            'getCurrentLogFilePath': vi.fn(() => 'output'),
            'logToFile': vi.fn(() => Promise.reject(error)),
            'startDeleteInterval': vi.fn(),
            'stopDeleteInterval': vi.fn()
        };

        const destination = await FileDestination.create({
            'getShouldWriteDebugInfo': () => true,
            'outputDirectory': await temporaryDirectory()
        }, {
            'createFileHandler': () => handler
        });

        await expect(destination!.log(operational)).resolves.toBeUndefined();

        await expect(destination!.auditLog(audit)).resolves.toBeUndefined();

        expect(handler.logToFile).toHaveBeenCalledTimes(2);

        expect(log).toHaveBeenCalledWith(expect.stringContaining('write failure'));

        expect(dir).toHaveBeenCalledWith(operational, { 'depth': null });

        expect(dir).toHaveBeenCalledWith(audit, { 'depth': null });
    });

    it('should return null rather than throw when its options are invalid', async () => {
        await expect(FileDestination.create({
            'outputFormats': ['xml'] as never
        })).resolves.toBeNull();
    });
});
