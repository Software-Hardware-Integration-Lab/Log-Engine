import { LoggingPlugin, resolveLoggingPluginConfigurationOptions } from './base/LoggingPlugin.js';
import { type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';
import { DEFAULT_FILE_DESTINATION_OPTIONS, type FileDestinationOptions, type ResolvedFileDestinationOptions } from '#/interfaces/plugins/FileDestination.js';
import { mkdir } from 'node:fs/promises';
import { assertGuardEquals } from 'typia';
import { SerializableAuditLog } from '#/classes/SerializableAuditLog.js';
import { SerializableOperationalLog } from '#/classes/SerializableOperationalLog.js';
import { LogFileHandler } from '#/classes/fileHandlers/LogFileHandler.js';

/** File handler operations consumed by {@link FileDestination}. */
interface FileDestinationFileHandler {
    /** Computes the current log file path for a stream. */
    'getCurrentLogFilePath': LogFileHandler['getCurrentLogFilePath'];
    /** Writes a serialized log record. */
    'logToFile': LogFileHandler['logToFile'];
    /** Starts expired-file cleanup. */
    'startDeleteInterval': LogFileHandler['startDeleteInterval'];
    /** Stops expired file cleanup. */
    'stopDeleteInterval': LogFileHandler['stopDeleteInterval'];
}

/** Runtime dependencies used by {@link FileDestination}. */
interface FileDestinationRuntime {
    /** Creates the configured output directory. */
    'createDirectory': (path: string) => Promise<void>;
    /** Creates the handler used to write and clean log files. */
    'createFileHandler': (
        options: ResolvedFileDestinationOptions,
        diagnosticReporter: (value: unknown, message: string) => void
    ) => FileDestinationFileHandler;
}

/** Default Node.js runtime dependencies used outside of controlled tests. */
const DEFAULT_RUNTIME: FileDestinationRuntime = {
    'createFileHandler': (options, diagnosticReporter) => new LogFileHandler(options, diagnosticReporter),
    'createDirectory': async (path) => { await mkdir(path, { 'recursive': true }); }
};

/** Provides file-based logging utilities. */
export class FileDestination extends LoggingPlugin {
    /** The unique Id for the plugin. */
    declare public readonly id: string;

    /** The resolved configuration used by this logging destination instance. */
    #appliedOptions: ResolvedFileDestinationOptions;
    #diagnosticReporter: (value: unknown, message: string) => void;
    #fileHandler: FileDestinationFileHandler;
    #runtime: FileDestinationRuntime;

    /**
     * @param options An optional parameter with optional properties representing the configurable options.
     * @param runtime Optional runtime dependencies used to create the output handler.
     * @returns The instantiated class as configured by the options. Default values are used when not supplied.
     */
    private constructor(
        options: FileDestinationOptions = DEFAULT_FILE_DESTINATION_OPTIONS,
        runtime: Partial<FileDestinationRuntime> = {}
    ) {
        super(options.id ?? 'FileDestination');

        this.#appliedOptions = FileDestination.#resolveOptions(options);

        this.#diagnosticReporter = (value: unknown, message: string): void => {
            LoggingPlugin.writeConfiguredDebugInfo(this.#appliedOptions, value, message);
        };

        this.#runtime = {
            ...DEFAULT_RUNTIME,
            ...runtime
        };

        this.#fileHandler = this.#runtime.createFileHandler(this.#appliedOptions, this.#diagnosticReporter);
    }

    /** Cleans up file handler delete interval. */
    public override dispose(): void {
        this.#fileHandler.stopDeleteInterval();
    }

    /**
     * Creates an instance of FileDestination with the specified options.
     * @param options Configuration options for the file destination.
     * @param runtime Optional runtime dependencies used to create the destination.
     * @returns The class instance or null if initialization fails.
     */
    public static async create(
        options?: FileDestinationOptions,
        runtime: Partial<FileDestinationRuntime> = {}
    ): Promise<FileDestination | null> {
        try {
            /** Resolved options with defaults applied. */
            const resolvedOptions = FileDestination.#resolveOptions(options);

            // #region Input validation
            /* v8 ignore next */
            assertGuardEquals(resolvedOptions);
            // #endregion Input validation

            /** The configured destination instance. */
            const instance = new FileDestination(resolvedOptions, runtime);

            // Ensure the output directory exists before any logging occurs.
            await instance.#runtime.createDirectory(instance.#appliedOptions.outputDirectory);

            // Start expired-file cleanup interval.
            instance.#fileHandler.startDeleteInterval();

            // Return the initialized logging destination instance.
            return instance;
        } catch (error: unknown) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            // Log to debug console.
            this.writeConfiguredDebugInfo(options, error, message);

            // Return null if any errors occur during initialization to avoid impacting the application with logging failures.
            return null;
        }
    }

    /**
     * The audit logging function for the plugin.
     * @param log The audit log object to be logged.
     */
    public async auditLog(log: AuditLog): Promise<void> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(log);
        // #endregion Input validation

        // Skip file output when audit log writing is explicitly disabled for this destination instance.
        if (
            // Check the function exists
            this.#appliedOptions.getShouldWriteAuditLogs &&
            // Check if the function returns false
            !this.#appliedOptions.getShouldWriteAuditLogs()
        ) { return; }

        try {
            /** The active log filepath for the current rotation window. */
            const filepath = this.#fileHandler.getCurrentLogFilePath('AUDIT_');

            const serializableLog = new SerializableAuditLog(log);

            for (const format of this.#appliedOptions.outputFormats) {
                await this.#fileHandler.logToFile(filepath, serializableLog.serialize(format), format);
            }
        } catch (error) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            // Log to debug console.
            FileDestination.writeConfiguredDebugInfo(this.#appliedOptions, error, message);

            // Log original log to debug console for inspection if file logging fails.
            FileDestination.writeConfiguredDebugInfo(this.#appliedOptions, log, '[FileDestination] Failed to write audit log to file, logging to debug console instead. Original log:');
        }
    }

    /**
     * Logs a given log object to the appropriate log files based on the configured output formats.
     * @param log Log object to be logged.
     */
    public async log(log: OperationalLog): Promise<void> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(log);
        // #endregion Input validation

        // Skip file output when operational log writing is explicitly disabled for this destination instance.
        if (
            this.#appliedOptions.getShouldWriteOperationalLogs &&
            !this.#appliedOptions.getShouldWriteOperationalLogs()
        ) { return; }

        try {
            /** The active log filepath for the current rotation window. */
            const filepath = this.#fileHandler.getCurrentLogFilePath('OP_');

            const serializableLog = new SerializableOperationalLog(log);

            for (const format of this.#appliedOptions.outputFormats) {
                await this.#fileHandler.logToFile(filepath, serializableLog.serialize(format), format);
            }
        } catch (error) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            // Log to debug console.
            FileDestination.writeConfiguredDebugInfo(this.#appliedOptions, error, message);

            // Log original log to debug console for inspection if file logging fails.
            FileDestination.writeConfiguredDebugInfo(this.#appliedOptions, log, '[FileDestination] Failed to write log to file, logging to debug console instead. Original log:');
        }
    }

    /**
     * Resolves the provided options against the default configuration.
     * @param options Optional configuration supplied to the file destination.
     * @returns Fully resolved configuration for the destination instance.
     */
    static #resolveOptions(options: FileDestinationOptions = DEFAULT_FILE_DESTINATION_OPTIONS): ResolvedFileDestinationOptions {
        /** Resolved optional predicates and validation-safe non-function input. */
        const {
            getShouldWriteAuditLogs,
            getShouldWriteDebugInfo,
            getShouldWriteOperationalLogs,
            validationInput
        } = resolveLoggingPluginConfigurationOptions(options, DEFAULT_FILE_DESTINATION_OPTIONS);

        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(validationInput as Omit<FileDestinationOptions, 'getShouldWriteAuditLogs' | 'getShouldWriteDebugInfo' | 'getShouldWriteOperationalLogs'>);
        // #endregion Input validation

        /** The fully resolved configuration for the destination instance. */
        const resolvedOptions: ResolvedFileDestinationOptions = {
            ...DEFAULT_FILE_DESTINATION_OPTIONS,
            ...options,
            getShouldWriteAuditLogs,
            getShouldWriteDebugInfo,
            getShouldWriteOperationalLogs,
            'outputFormats': options.outputFormats
                ? [...options.outputFormats]
                : [...DEFAULT_FILE_DESTINATION_OPTIONS.outputFormats]
        };

        return resolvedOptions;
    }
}
