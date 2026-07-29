import { type AuditLog, LogLevel, type OperationalLog } from '#/interfaces/LogEngine.js';
import { type ConsoleDestinationMethod, type ConsoleDestinationOptions, DEFAULT_CONSOLE_DESTINATION_LOG_LEVEL_MAP, DEFAULT_CONSOLE_DESTINATION_OPTIONS, type ResolvedConsoleDestinationOptions } from '#/interfaces/plugins/ConsoleDestination.js';
import { LoggingPlugin } from './base/LoggingPlugin.js';
import { assertGuardEquals } from 'typia';

/** Outputs operational and audit logs to the console using only destination-local configuration. */
export class ConsoleDestination extends LoggingPlugin {
    /** The unique Id for the plugin. */
    declare public readonly id: string;

    /** The resolved configuration used by this destination instance. */
    #appliedOptions: ResolvedConsoleDestinationOptions;

    /**
     * @param options Optional factory options for console logging behavior.
     */
    private constructor(options: ConsoleDestinationOptions = DEFAULT_CONSOLE_DESTINATION_OPTIONS) {
        /*
         * Input validation would be duplicated here as this class must be instantiated through the
         * static create() method to ensure proper error handling and logging of invalid configuration.
         */

        super(options.id ?? 'ConsoleDestination');

        /** The normalized configuration for this destination instance. */
        const resolvedOptions = ConsoleDestination.#resolveOptions(options);

        this.#appliedOptions = resolvedOptions;
    }

    /**
     * Creates a configured console destination instance.
     * @param options Optional factory options for console logging behavior.
     * @returns The configured console destination instance, or null if creation fails.
     */
    public static create(options?: ConsoleDestinationOptions): Promise<ConsoleDestination | null> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(options);
        // #endregion Input validation

        try {
            return Promise.resolve(new ConsoleDestination(options));
        } catch (error: unknown) {
            /* v8 ignore start */
            /*
             * Defensive backstop: with the input validation above, this branch is not reachable
             * through normal object literals since typia's excess-property check already touches
             * every own key. Retained (and excluded from coverage) to preserve the documented
             * `create()` contract of never throwing, in case of unusual inputs (e.g. proxies or
             * getters with side effects) or future changes to construction/resolution logic.
             */

            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            // Log the failure through the shared destination debug path so invalid configuration is visible to callers.
            ConsoleDestination.writeConfiguredDebugInfo(options, error, `ConsoleDestination could not be created. ${ message }`);

            return Promise.resolve(null);
            /* v8 ignore stop */
        }
    }

    public override dispose(): void {
        // Intentional no-op. ConsoleDestination does not have any dangling operations to clean up.
    }

    /**
     * Logs a formatted operational log string and log object to the configured console method.
     * @param log The operational log to be written.
     * @returns Promise indicating the process is complete.
     */
    public log(log: OperationalLog): Promise<void> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(log);
        // #endregion Input validation

        // Skip console output when operational log writing is explicitly disabled for this destination instance.
        if (
            this.#appliedOptions.getShouldWriteOperationalLogs &&
            !this.#appliedOptions.getShouldWriteOperationalLogs()
        ) {
            return Promise.resolve();
        }

        /** The UTC timestamp of the log creation time, formatted as 'YYYY-MM-DD HH:mm:ss.sss'. */
        const createdUtc = ConsoleDestination.#formatTimestamp(log.timeGenerated);

        /** The formatted operational log message for console output. */
        const logMessage = `${ createdUtc }: ${ ConsoleDestination.#getLogLevelName(log.level) } ${ log.message }`;

        ConsoleDestination.#writeToConsole(this.#getConsoleMethod(log.level), logMessage, log);

        return Promise.resolve();
    }

    /**
     * Logs a formatted audit log string and log object to the console.
     * @param log The audit log to be written.
     * @returns Promise indicating the process is complete.
     */
    public auditLog(log: AuditLog): Promise<void> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(log);
        // #endregion Input validation

        // Skip console output when audit log writing is explicitly disabled for this destination instance.
        if (
            this.#appliedOptions.getShouldWriteAuditLogs &&
            !this.#appliedOptions.getShouldWriteAuditLogs()
        ) {
            return Promise.resolve();
        }

        /** The UTC timestamp of the log creation time, formatted as 'YYYY-MM-DD HH:mm:ss.sss'. */
        const createdUtc = ConsoleDestination.#formatTimestamp(log.timeGenerated);

        /** The formatted audit log message for console output. */
        const logMessage = `${ createdUtc }: AUDIT : ${ log.category } ${ log.message }`;

        ConsoleDestination.#writeToConsole('log', logMessage, log);

        return Promise.resolve();
    }

    /**
     * Resolves the provided options against the default configuration.
     * @param options Optional factory options for console logging behavior.
     * @returns Fully resolved configuration for the destination instance.
     */
    static #resolveOptions(options: ConsoleDestinationOptions = DEFAULT_CONSOLE_DESTINATION_OPTIONS): ResolvedConsoleDestinationOptions {
        /** Resolved optional predicates and validation-safe non-function input. */
        const {
            getShouldWriteAuditLogs,
            getShouldWriteDebugInfo,
            getShouldWriteOperationalLogs,
            validationInput
        } = ConsoleDestination.resolveConfigurationOptions(options, DEFAULT_CONSOLE_DESTINATION_OPTIONS);

        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(validationInput as Omit<ConsoleDestinationOptions, 'getShouldWriteAuditLogs' | 'getShouldWriteDebugInfo' | 'getShouldWriteOperationalLogs'>);
        // #endregion Input validation

        /** The fully resolved configuration for the destination instance. */
        const resolvedOptions: ResolvedConsoleDestinationOptions = {
            getShouldWriteAuditLogs,
            getShouldWriteDebugInfo,
            getShouldWriteOperationalLogs,
            'logLevelToConsoleMethod': {
                ...DEFAULT_CONSOLE_DESTINATION_LOG_LEVEL_MAP,
                ...options.logLevelToConsoleMethod ?? {}
            }
        };

        return resolvedOptions;
    }

    /**
     * Resolves the console method that should be used for the provided log level.
     * @param logLevel The log level under evaluation.
     * @returns The console method to use.
     */
    #getConsoleMethod(logLevel: LogLevel): ConsoleDestinationMethod {
        return this.#appliedOptions.logLevelToConsoleMethod[logLevel];
    }

    /**
     * Formats a log timestamp for console output.
     * @param timestamp The timestamp to format.
     * @returns The formatted UTC timestamp.
     */
    static #formatTimestamp(timestamp: Date): string {
        return timestamp.toISOString().slice(0, 23)
            .replace('T', ' ');
    }

    /**
     * Resolves the uppercase text name for a log level.
     * @param logLevel The log level to format.
     * @returns The uppercase log level name.
     */
    static #getLogLevelName(logLevel: LogLevel): string {
        return LogLevel[logLevel].toUpperCase();
    }

    /**
     * Writes a formatted message and log payload to the selected console method.
     * @param method The console method to use.
     * @param message The formatted console message.
     * @param log The payload to log alongside the message.
     */
    static #writeToConsole(method: ConsoleDestinationMethod, message: string, log: AuditLog | OperationalLog): void {
        // eslint-disable-next-line no-console
        console[method](message, log);
    }
}
