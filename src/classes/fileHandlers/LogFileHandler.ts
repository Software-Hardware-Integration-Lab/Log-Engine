import type { FileHandlerDiagnosticReporter, FileLogFormat, ResolvedFileDestinationOptions } from '#/interfaces/plugins/FileDestination.js';
import { mkdir, open, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { assertGuardEquals } from 'typia';

/** File handle operations used by {@link LogFileHandler}. */
interface LogFileHandlerFileHandle {
    /** Appends a UTF-8 log entry. */
    'appendFile': (data: string, options: { 'encoding': 'utf8'; }) => Promise<void>;
    /** Closes the file handle. */
    'close': () => Promise<void>;
}

/** Runtime dependencies used by {@link LogFileHandler}. */
export interface LogFileHandlerRuntime {
    /** Creates a directory recursively when needed. */
    'createDirectory': (path: string) => Promise<void>;
    /** Opens a file for appending. */
    'openFile': (path: string) => Promise<LogFileHandlerFileHandle>;
    /** Lists the output directory entries. */
    'readDirectory': (path: string) => Promise<{
        'isFile': () => boolean;
        'name': string;
    }[]>;
    /** Reads file metadata. */
    'statFile': (path: string) => Promise<{ 'mtimeMs': number; }>;
    /** Deletes an expired file. */
    'deleteFile': (path: string) => Promise<void>;
    /** Returns the current timestamp in milliseconds. */
    'now': () => number;
    /** Schedules periodic cleanup. */
    'setInterval': (callback: () => void, interval: number) => NodeJS.Timeout;
    /** Cancels periodic cleanup. */
    'clearInterval': (interval: NodeJS.Timeout) => void;
}

/** Default Node.js runtime dependencies used outside of controlled tests. */
const DEFAULT_RUNTIME: LogFileHandlerRuntime = {
    'clearInterval': (interval) => { clearInterval(interval); },
    'createDirectory': async (path) => { await mkdir(path, { 'recursive': true }); },
    'deleteFile': unlink,
    'now': Date.now,
    'openFile': async (path) => await open(path, 'a'),
    'readDirectory': async (path) => await readdir(path, { 'withFileTypes': true }),
    'setInterval': (callback, interval) => setInterval(callback, interval),
    'statFile': stat
};

/**
 * Abstract base class for handling log file operations with rotation support.
 */
export class LogFileHandler {
    #cleanupInFlight: Promise<void> | null = null;
    #deleteInterval: NodeJS.Timeout | null = null;

    protected readonly appliedOptions: ResolvedFileDestinationOptions;
    readonly #diagnosticReporter: FileHandlerDiagnosticReporter;
    readonly #deleteFileIntervalMs: number;
    readonly #runtime: LogFileHandlerRuntime;

    constructor(
        appliedOptions: ResolvedFileDestinationOptions,
        diagnosticReporter: FileHandlerDiagnosticReporter,
        deleteFileIntervalMs = 1000 * 60 * 5,
        runtime: Partial<LogFileHandlerRuntime> = {}
    ) {
        // #region Input validation
        assertGuardEquals(appliedOptions);

        assertGuardEquals(diagnosticReporter);

        assertGuardEquals(deleteFileIntervalMs);
        // #endregion Input validation

        this.appliedOptions = appliedOptions;

        this.#diagnosticReporter = diagnosticReporter;

        this.#deleteFileIntervalMs = deleteFileIntervalMs;

        this.#runtime = {
            ...DEFAULT_RUNTIME,
            ...runtime
        };
    }

    public startDeleteInterval(): void {
        if (this.#deleteInterval) {
            return;
        }

        this.#deleteInterval = this.#runtime.setInterval(() => {
            void this.deleteExpiredLogFiles()
                .catch((error: unknown) => {
                    this.#diagnosticReporter(
                        error,
                        'Failed to delete expired log files.'
                    );
                });
        }, this.#deleteFileIntervalMs);

        // Allow the process to exit if this is the only active timer.
        this.#deleteInterval.unref();
    }

    public stopDeleteInterval(): void {
        if (this.#deleteInterval) {
            this.#runtime.clearInterval(this.#deleteInterval);

            this.#deleteInterval = null;
        }
    }

    /**
     * Gets the current log file path based on the rotation interval.
     * @param filePathPrefix The prefix for the log file name, either 'OP_' for operational logs or 'AUDIT_' for audit logs.
     * @param now - The current date/time (defaults to now).
     * @returns The log file path with timestamp suffix.
     */
    public getCurrentLogFilePath(filePathPrefix: 'OP_' | 'AUDIT_', now: Date = new Date()): string {
        // #region Input validation
        assertGuardEquals(filePathPrefix);

        assertGuardEquals(now);

        // #endregion Input validation

        /** Rotation interval in milliseconds. */
        const rotationMs = this.appliedOptions.rotationIntervalMinutes * 60 * 1000;

        /** Start of the current rotation bucket in milliseconds. */
        const bucketStartMs = Math.floor(now.getTime() / rotationMs) * rotationMs;

        /** Date object representing the start of the current rotation bucket. */
        const bucketTime = new Date(bucketStartMs);

        /** Formatted timestamp suffix for the log file name. */
        const suffix = bucketTime
            .toISOString()
            .slice(0, 16)
            .replace('T', '_')
            .replace(':', '');

        return join(this.appliedOptions.outputDirectory, `${ filePathPrefix }_${ suffix }`);
    }

    /**
     * Removes expired `.log` and `.jsonl` files from the configured output directory.
     * Computes a cutoff timestamp using {@link ResolvedFileDestinationOptions.logRetentionAgeMinutes}, scans the output directory, and deletes matching files older than the cutoff.
     * Ensures only one cleanup operation runs at a time.
     * @returns A promise that resolves when the cleanup process has completed.
     */
    public async deleteExpiredLogFiles(): Promise<void> {
        // Ensure only one cleanup operation runs at a time by tracking an in-flight cleanup promise.
        if (!this.#cleanupInFlight) {
            // Start the cleanup process and store the promise to track its progress. Once the cleanup completes, reset the in-flight promise to allow future cleanups.
            this.#cleanupInFlight = this.#runDeleteExpiredLogFiles()
                .finally(() => {
                    // Reset the in-flight cleanup promise when the cleanup process completes to allow future cleanups to run.
                    this.#cleanupInFlight = null;
                });
        }

        // Wait for any in-flight cleanup operation to complete before allowing another cleanup to start. This ensures that cleanups do not run concurrently, which could lead to duplicate work or filesystem races.
        await this.#cleanupInFlight;
    }

    /**
     * Executes the cleanup process for expired `.log` files.
     */
    async #runDeleteExpiredLogFiles(): Promise<void> {
        /** Cutoff timestamp for expired files. */
        const fileCutoffMs = this.#runtime.now() - (this.appliedOptions.logRetentionAgeMinutes * 60 * 1000);

        // Ensure the output directory exists before scanning it.
        await this.#runtime.createDirectory(this.appliedOptions.outputDirectory);

        /** Variable for holding directory entries found in the output folder. */
        const allLogFileEntries = await this.#runtime.readDirectory(this.appliedOptions.outputDirectory);

        /** A list of absolute paths for files in the output directory. */
        const allFilepaths = allLogFileEntries
            .filter((fileEntry) => fileEntry.isFile())
            .map((fileEntry) => join(this.appliedOptions.outputDirectory, fileEntry.name));

        /** File stats of the entries found in the log folder including modification timestamps. */
        const fileStatsResults = await Promise.allSettled(allFilepaths.map((path) => this.#runtime.statFile(path)));

        /** Filepaths of expired `.log` files based on modification time. */
        const expiredLogFilepaths: string[] = [];

        // Iterate through the file stats results to identify expired log files and log any errors encountered while accessing file stats.
        for (const [index, result] of fileStatsResults.entries()) {
            /** File path aligned with the current settled stat result by index. */
            const filepath = allFilepaths[index];

            if (!filepath) { continue; }

            const isLogFile =
                filepath.toLowerCase().endsWith('.log') ||
                filepath.toLowerCase().endsWith('.jsonl');

            // Log any rejections to the debug console.
            if (result.status === 'rejected') {
                // Log to debug console.
                this.#diagnosticReporter(result, String(result.reason) || `Failed to stat file: ${ filepath }`);
            } else if (result.value.mtimeMs < fileCutoffMs && isLogFile) {
                // Add expired log to the list
                expiredLogFilepaths.push(filepath);
            }
        }

        /**
         * Represents the settled outcomes of deleting expired log files.
         */
        const settledResults = await Promise.allSettled(expiredLogFilepaths.map(async (path) => {
            // Delete each expired log file.
            await this.#runtime.deleteFile(path);
        }));

        // Iterate through the settled results of the deletion operations to log any errors encountered while deleting files.
        for (const result of settledResults) {
            if (result.status === 'rejected') {
                // Log any rejections to the debug console.
                this.#diagnosticReporter(result, String(result.reason));
            }
        }
    }

    /**
     * Logs a given log string to a specified file.
     * @param filepath The filepath of log to write to.
     * @param log The log to be written.
     * @param format The file format of the log to be written.
     * @throws {TypeGuardError | unknown} Will throw an error if the file cannot be opened or written to.
     */
    public async logToFile(filepath: string, log: string, format: FileLogFormat): Promise<void> {
        try {
            // #region Input validation
            assertGuardEquals(filepath);

            assertGuardEquals(log);

            assertGuardEquals(format);
            // #endregion Input validation
        } catch (error: unknown) {
            this.#diagnosticReporter(error, 'Input validation failed for logToFile() parameters.');

            throw error;
        }

        const expectedExtension = format === 'json'
            ? '.jsonl'
            : '.log';

        const existingExtension = extname(filepath);

        const outputFilepath = existingExtension
            ? `${ filepath.slice(0, -existingExtension.length) }${ expectedExtension }`
            : `${ filepath }${ expectedExtension }`;

        // Verify that the filepath directory exists.
        await this.#runtime.createDirectory(dirname(outputFilepath));

        /** The opened log file for append operations. */
        const fileHandle: LogFileHandlerFileHandle = await this.#runtime.openFile(outputFilepath);

        try {
            // Append the formatted log entry to the file.
            await fileHandle.appendFile(`${ log }\n`, { 'encoding': 'utf8' });
        } catch (error: unknown) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            // Log to debug console.
            this.#diagnosticReporter(error, message);

            throw error;
        } finally {
            // Close the file handle no matter what happens.
            await fileHandle.close();
        }
    }
}
