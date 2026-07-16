import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogFileHandler, type LogFileHandlerRuntime } from '#/classes/fileHandlers/LogFileHandler.js';
import type { FileHandlerDiagnosticReporter, ResolvedFileDestinationOptions } from '#/interfaces/plugins/FileDestination.js';

const directories: string[] = [];

interface TestFileHandle {
    'appendFile': () => Promise<void>;
    'close': () => Promise<void>;
}

async function createHandler(retentionMinutes = 60): Promise<{
    'directory': string;
    'handler': LogFileHandler;
    'options': ResolvedFileDestinationOptions;
    'reporter': FileHandlerDiagnosticReporter;
}> {
    const directory = await mkdtemp(join(tmpdir(), 'log-engine-test-'));

    directories.push(directory);

    const reporter: FileHandlerDiagnosticReporter = vi.fn();

    const options: ResolvedFileDestinationOptions = {
        'getShouldWriteAuditLogs': void 0,
        'getShouldWriteDebugInfo': void 0,
        'getShouldWriteOperationalLogs': void 0,
        'logRetentionAgeMinutes': retentionMinutes,
        'outputDirectory': directory,
        'outputFormats': ['formattedLog'],
        'rotationIntervalMinutes': 60
    };

    return {
        directory,
        'handler': new LogFileHandler(options, reporter, 10),
        options,
        reporter
    };
}

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {
        'force': true,
        'recursive': true
    })));

    vi.useRealTimers();
});

describe('LogFileHandler', () => {
    it('should derive a stable path from the start of the rotation interval', async () => {
        const { handler } = await createHandler();

        expect(handler.getCurrentLogFilePath('OP_', new Date('2025-01-02T03:59:59.000Z'))).toMatch(/OP__2025-01-02_0300$/u);

        expect(handler.getCurrentLogFilePath('AUDIT_', new Date('2025-01-02T04:00:00.000Z'))).toMatch(/AUDIT__2025-01-02_0400$/u);
    });

    it('should append logs using the extension selected by the requested format', async () => {
        const { directory, handler } = await createHandler();

        const base = join(directory, 'events.old');

        await handler.logToFile(base, 'formatted', 'formattedLog');

        await handler.logToFile(base, '{"event":true}', 'json');

        await expect(readFile(join(directory, 'events.log'), 'utf8')).resolves.toBe('formatted\n');

        await expect(readFile(join(directory, 'events.jsonl'), 'utf8')).resolves.toBe('{"event":true}\n');
    });

    it('should delete only expired log and jsonl files while preserving fresh and unrelated files', async () => {
        const { directory, handler } = await createHandler(1);

        const oldLog = join(directory, 'old.log');

        const oldJson = join(directory, 'old.jsonl');

        const oldText = join(directory, 'old.txt');

        const freshLog = join(directory, 'fresh.log');

        await Promise.all([oldLog, oldJson, oldText, freshLog].map((file) => writeFile(file, 'content')));

        const old = new Date(Date.now() - 120_000);

        await Promise.all([oldLog, oldJson, oldText].map((file) => utimes(file, old, old)));

        await Promise.all([handler.deleteExpiredLogFiles(), handler.deleteExpiredLogFiles()]);

        await expect(readFile(oldLog)).rejects.toMatchObject({ 'code': 'ENOENT' });

        await expect(readFile(oldJson)).rejects.toMatchObject({ 'code': 'ENOENT' });

        await expect(readFile(oldText, 'utf8')).resolves.toBe('content');

        await expect(readFile(freshLog, 'utf8')).resolves.toBe('content');
    });

    it('should start only one cleanup interval and stop it without leaving a scheduled cleanup', async () => {
        vi.useFakeTimers();

        const { handler } = await createHandler();

        const cleanup = vi.spyOn(handler, 'deleteExpiredLogFiles').mockResolvedValue(void 0);

        handler.startDeleteInterval();

        handler.startDeleteInterval();

        await vi.advanceTimersByTimeAsync(10);

        handler.stopDeleteInterval();

        await vi.advanceTimersByTimeAsync(20);

        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should report stat and deletion failures while continuing cleanup of other files', async () => {
        const { options, reporter } = await createHandler();

        const statFailure = new Error('cannot stat');

        const deleteFailure = new Error('cannot delete');

        const runtime: Partial<LogFileHandlerRuntime> = {
            'createDirectory': () => Promise.resolve(),
            'deleteFile': () => Promise.reject(deleteFailure),
            'now': () => 4_000_000,
            'readDirectory': () => Promise.resolve([
                {
                    'isFile': () => true,
                    'name': 'stat-failure.log'
                },
                {
                    'isFile': () => true,
                    'name': 'delete-failure.jsonl'
                }
            ]),
            'statFile': (path) => {
                if (path.endsWith('stat-failure.log')) { return Promise.reject(statFailure); }

                return Promise.resolve({ 'mtimeMs': 0 });
            }
        };

        const controlledHandler = new LogFileHandler(options, reporter, 10, runtime);

        await controlledHandler.deleteExpiredLogFiles();

        expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ 'reason': statFailure }), 'Error: cannot stat');

        expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ 'reason': deleteFailure }), 'Error: cannot delete');

        expect(reporter).toHaveBeenCalledTimes(2);
    });

    it('should report cleanup failures raised from the scheduled interval callback', async () => {
        vi.useFakeTimers();

        const { options, reporter } = await createHandler();

        const failure = new Error('directory failure');

        const controlledHandler = new LogFileHandler(
            options,
            reporter,
            10,
            { 'createDirectory': (): Promise<void> => Promise.reject(failure) }
        );

        controlledHandler.startDeleteInterval();

        await vi.advanceTimersByTimeAsync(10);

        controlledHandler.stopDeleteInterval();

        expect(reporter).toHaveBeenCalledWith(failure, 'Failed to delete expired log files.');
    });

    it('should propagate open and close failures and report append failures', async () => {
        const { directory, options, reporter } = await createHandler();

        const openFailure = new Error('cannot open');

        const appendFailure = new Error('cannot append');

        const closeFailure = new Error('cannot close');

        const openFailingHandler = new LogFileHandler(options, reporter, 10, {
            'createDirectory': (): Promise<void> => Promise.resolve(),
            'openFile': (): Promise<never> => Promise.reject(openFailure)
        });

        await expect(openFailingHandler.logToFile(join(directory, 'open'), 'record', 'formattedLog')).rejects.toBe(openFailure);

        const close = vi.fn<() => Promise<void>>((): Promise<void> => Promise.resolve());

        const appendFailingHandler = new LogFileHandler(options, reporter, 10, {
            'createDirectory': (): Promise<void> => Promise.resolve(),
            'openFile': (): Promise<TestFileHandle> => Promise.resolve({
                'appendFile': (): Promise<void> => Promise.reject(appendFailure),
                close
            })
        });

        await expect(appendFailingHandler.logToFile(join(directory, 'append'), 'record', 'formattedLog')).rejects.toBe(appendFailure);

        expect(reporter).toHaveBeenCalledWith(appendFailure, 'cannot append');

        expect(close).toHaveBeenCalledOnce();

        const closeFailingHandler = new LogFileHandler(options, reporter, 10, {
            'createDirectory': (): Promise<void> => Promise.resolve(),
            'openFile': (): Promise<TestFileHandle> => Promise.resolve({
                'appendFile': (): Promise<void> => Promise.resolve(),
                'close': (): Promise<void> => Promise.reject(closeFailure)
            })
        });

        await expect(closeFailingHandler.logToFile(join(directory, 'close'), 'record', 'formattedLog')).rejects.toBe(closeFailure);
    });
});
