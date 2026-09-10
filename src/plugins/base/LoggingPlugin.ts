import type { AuditLog, OperationalLog } from '#/interfaces/LogEngine.js';
import type { LoggingPluginConfigurationOptions, LoggingPluginContract } from '#/interfaces/plugins/LoggingPlugin.js';
import { assertGuardEquals } from 'typia';

/** Shared resolution result for optional logging-plugin predicate configuration. */
export interface LoggingPluginConfigurationResolution {
    /** Resolved audit-write predicate preserved from caller options when present. */
    'getShouldWriteAuditLogs': LoggingPluginConfigurationOptions['getShouldWriteAuditLogs'];
    /** Resolved debug predicate preserved from caller options when present. */
    'getShouldWriteDebugInfo': LoggingPluginConfigurationOptions['getShouldWriteDebugInfo'];
    /** Resolved operational-write predicate preserved from caller options when present. */
    'getShouldWriteOperationalLogs': LoggingPluginConfigurationOptions['getShouldWriteOperationalLogs'];
    /** Runtime copy used to validate only non-function option members. */
    'validationInput': unknown;
}

/** Base class for executable logging destinations. */
export abstract class LoggingPlugin implements LoggingPluginContract {
    /** The unique Id for the plugin. */
    declare public readonly id: string;

    /**
     * @param id Immutable identifier for the plugin instance.
     */
    protected constructor(id: string) {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(id);
        // #endregion Input validation

        // Define the 'id' property with the provided value and make it immutable and enumerable.
        Object.defineProperty(this, 'id', {
            'configurable': false,
            'enumerable': true,
            'value': id,
            'writable': false
        });
    }

    /**
     * The ordinary logging function for the plugin.
     * @param log Log entry to be recorded by the destination.
     */
    public abstract log(log: OperationalLog): Promise<void>;

    /**
     * The audit logging function for the plugin.
     * @param log Audit log entry to be recorded by the destination.
     */
    public abstract auditLog(log: AuditLog): Promise<void>;

    /** Cleanup to remove dangling operations when the plugin is removed. */
    public abstract dispose(): void;

    /**
     * Shared default predicate used when a host wants unconditional logging for a stream.
     * @returns True, indicating that logging should be written.
     */
    protected static defaultGetShouldWriteLogs(): boolean {
        return true;
    }

    /**
     * Resolves optional logging-plugin predicates and strips function members from the validation input.
     * @param configuration Caller-owned configuration under evaluation.
     * @param defaultConfiguration Default predicate configuration used when caller predicates are omitted.
     * @returns Resolved predicates alongside a runtime copy that contains only non-function members for validation.
     */
    protected static resolveConfigurationOptions(
        configuration: unknown,
        defaultConfiguration: LoggingPluginConfigurationOptions
    ): LoggingPluginConfigurationResolution {
        /*
         * `defaultConfiguration` is never caller-supplied; every call site passes a package-owned
         * `DEFAULT_*_OPTIONS` constant. Runtime validation would only ever be checking our own
         * compile-time-checked defaults against themselves, so it is intentionally skipped here,
         * consistent with how other internal-only values (e.g. in `#writeDebugInfoInternal`) are
         * handled without `assertGuardEquals`.
         */

        /** Runtime object view used to inspect optional function members safely. */
        const configurationObject = typeof configuration === 'object' && configuration !== null
            ? configuration as Record<string, unknown>
            : null;

        /** Runtime copy used to validate non-function option members. */
        const validationInput = configurationObject
            ? { ...configurationObject }
            : configuration;

        /** Optional caller-owned audit-write predicate preserved across option resolution. */
        const getShouldWriteAuditLogs = typeof configurationObject?.['getShouldWriteAuditLogs'] === 'function'
            ? configurationObject['getShouldWriteAuditLogs'] as NonNullable<LoggingPluginConfigurationOptions['getShouldWriteAuditLogs']>
            : defaultConfiguration.getShouldWriteAuditLogs;

        /** Optional caller-owned debug predicate preserved across option resolution. */
        const getShouldWriteDebugInfo = typeof configurationObject?.['getShouldWriteDebugInfo'] === 'function'
            ? configurationObject['getShouldWriteDebugInfo'] as NonNullable<LoggingPluginConfigurationOptions['getShouldWriteDebugInfo']>
            : defaultConfiguration.getShouldWriteDebugInfo;

        /** Optional caller-owned operational-write predicate preserved across option resolution. */
        const getShouldWriteOperationalLogs = typeof configurationObject?.['getShouldWriteOperationalLogs'] === 'function'
            ? configurationObject['getShouldWriteOperationalLogs'] as NonNullable<LoggingPluginConfigurationOptions['getShouldWriteOperationalLogs']>
            : defaultConfiguration.getShouldWriteOperationalLogs;

        if (configurationObject && typeof configurationObject['getShouldWriteAuditLogs'] === 'function') {
            (validationInput as Record<string, unknown>)['getShouldWriteAuditLogs'] = void 0;
        }

        if (configurationObject && typeof configurationObject['getShouldWriteDebugInfo'] === 'function') {
            (validationInput as Record<string, unknown>)['getShouldWriteDebugInfo'] = void 0;
        }

        if (configurationObject && typeof configurationObject['getShouldWriteOperationalLogs'] === 'function') {
            (validationInput as Record<string, unknown>)['getShouldWriteOperationalLogs'] = void 0;
        }

        return {
            getShouldWriteAuditLogs,
            getShouldWriteDebugInfo,
            getShouldWriteOperationalLogs,
            validationInput
        };
    }

    /**
     * Writes debug information using caller-supplied plugin configuration.
     * @param configuration Caller-owned plugin configuration used to decide whether diagnostics are enabled.
     * @param object The object to log for inspection. For non Error typed objects it is recommended to serialize to a json string.
     * @param message An optional message to log before the object.
     */
    protected static writeConfiguredDebugInfo(
        configuration: unknown,
        object?: unknown,
        message?: unknown
    ): void {
        LoggingPlugin.#writeDebugInfoInternal(LoggingPlugin.#getShouldWriteDebugInfo(configuration), this.name, object, message);
    }

    /**
     * Determines whether plugin diagnostics are enabled by caller-owned configuration.
     * @param configuration Caller-owned plugin configuration under evaluation.
     * @returns True when plugin diagnostics should be written.
     */
    static #getShouldWriteDebugInfo(configuration: unknown): boolean {
        if (typeof configuration !== 'object' || configuration === null) {
            return false;
        }

        /** Runtime view used to inspect caller-owned debug configuration. */
        const configurationInput = configuration as Partial<LoggingPluginConfigurationOptions>;

        if (typeof configurationInput.getShouldWriteDebugInfo !== 'function') {
            return false;
        }

        try {
            return configurationInput.getShouldWriteDebugInfo();
        } catch {
            return false;
        }
    }

    /**
     * Writes debug information using a pre-evaluated boolean flag.
     * @param debugEnabled Flag that indicates whether debug output should be written.
     * @param object The object to log for inspection.
     * @param message An optional message to log before the object.
     */
    protected static writeDebugInfoWhen(
        debugEnabled: boolean,
        object?: unknown,
        message?: unknown
    ): void {
        // #region Input validation

        /* v8 ignore next */
        assertGuardEquals(debugEnabled);
        // #endregion Input validation

        LoggingPlugin.#writeDebugInfoInternal(debugEnabled, this.name, object, message);
    }

    /**
     * Performs the shared debug logging implementation for derived logging destinations.
     * @param debugEnabled Flag that indicates whether debug output should be written.
     * @param sourceName Name of the derived logging destination.
     * @param object The object to log for inspection.
     * @param message An optional message to log before the object.
     */
    static #writeDebugInfoInternal(
        debugEnabled: boolean,
        sourceName: string,
        object?: unknown,
        message?: unknown
    ): void {
        /*
         * Intentionally avoid `assertGuardEquals` in this last-chance failover helper.
         * This code exists to preserve the original upstream failure and emit best-effort diagnostics.
         * Throwing here, even for internal values such as `debugEnabled` or `sourceName`,
         * can mask the original error and destroy the most useful debugging context.
         * Internal values are therefore handled defensively and non-throwingly instead of being guard-validated.
         */

        /*
         * Require the flag to be explicitly boolean `true` so this failover path fails
         * closed without throwing on unexpected values.
         */
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
        if (debugEnabled !== true) {
            return;
        }

        /** Normalized source name used by the failover diagnostics if the provided value is not a valid string. */
        const resolvedSourceName = typeof sourceName === 'string' && sourceName.length > 0
            ? sourceName
            : 'UnknownLoggingPlugin';

        try {
            // If the message parameter is not left blank, write it.
            if (typeof message !== 'undefined') {
                // Write the specified message to the console using a representation that preserves useful diagnostics.
                if (message instanceof Error) {
                    // eslint-disable-next-line no-console
                    console.log(`\n${ message.stack ?? message.message }`);
                } else if (typeof message === 'string' || typeof message === 'number' || typeof message === 'boolean' || typeof message === 'bigint') {
                    // eslint-disable-next-line no-console
                    console.log(`\n${ message }`);
                } else {
                    // eslint-disable-next-line no-console
                    console.log('\n');

                    // eslint-disable-next-line no-console
                    console.dir(message, { 'depth': null });
                }
            } else {
                // If no message was specified, write a whitespace to separate the object from the line above it.
                // eslint-disable-next-line no-console
                console.log('\n');
            }

            // Log the specified object to the console if provided.
            // eslint-disable-next-line no-undefined
            if (object !== undefined) {
                // For Error instances, log stack/message explicitly to preserve diagnostic details.
                if (object instanceof Error) {
                    if (object.message) {
                        /** Log the error message explicitly to ensure it is visible in the console output. */
                        // eslint-disable-next-line no-console
                        console.log(`Error message: ${ object.message }`);
                    }

                    /** Extract the most relevant error information from the Error instance, preferring the stack trace, then the message, and finally falling back to a string representation of the object. */
                    const errorOutput = object.stack ?? String(object);

                    /** Log the error stack/message to the console to preserve diagnostic details. */
                    // eslint-disable-next-line no-console
                    console.log(errorOutput);
                } else {
                    // For arbitrary objects, use console.dir to better handle complex structures.
                    // eslint-disable-next-line no-console
                    console.dir(object, { 'depth': null });
                }
            }
        } catch (error) {
            /** Error message if present. */
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log any errors encountered during the debug logging process to the console to prevent silent failures.
            // eslint-disable-next-line no-console
            console.log(`\n[${ resolvedSourceName } Debug Log Failure] ${ errorMessage }`);
        }
    }
}
