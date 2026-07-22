import type { AuditLog, OperationalLog } from '../LogEngine.js';

/** Common contract that all logging plugins should implement. */
export interface LoggingPluginContract {
    /** The unique Id for the plugin. */
    readonly 'id': string;
    /** The ordinary logging function for the plugin. */
    'log': (log: OperationalLog) => Promise<void>;
    /** The audit logging function for the plugin. */
    'auditLog': (log: AuditLog) => Promise<void>;
    /** The cleanup operation for removing dangling operations when a plugin is removed. */
    'dispose': () => void;
}

/** Common configuration owned by callers and shared across all logging plugins. */
export interface LoggingPluginConfigurationOptions {
    /** Optional id string to allow the creation of multiple instances of the same plugin type where necessary. */
    'id'?: string;
    /** Returns whether audit logs should be written. */
    'getShouldWriteAuditLogs'?: () => boolean;
    /** Returns whether plugin diagnostics should be written. */
    'getShouldWriteDebugInfo'?: () => boolean;
    /** Returns whether operational logs should be written. */
    'getShouldWriteOperationalLogs'?: () => boolean;
}

/** Controls whether plugin creation accepts no options, optional options, or required options. */
export type LoggingPluginOptionsMode = 'none' | 'optional' | 'required';

/** The single explicit options object accepted by a logging plugin factory create call. */
export type LoggingPluginCreateOptions<TOptions = undefined, TMode extends LoggingPluginOptionsMode = 'none'> =
    TMode extends 'none' ? undefined : TMode extends 'optional' ? TOptions | undefined : TOptions;

/** Single-argument list for plugin factory creation. */
export type LoggingPluginCreateArguments<TOptions = undefined, TMode extends LoggingPluginOptionsMode = 'none'> =
    [options: LoggingPluginCreateOptions<TOptions, TMode>];

/** Function signature used to create logging plugin instances. */
export type LoggingPluginCreateFunction<
    TPlugin extends LoggingPluginContract,
    TOptions = undefined,
    TMode extends LoggingPluginOptionsMode = 'none'
> = (...args: LoggingPluginCreateArguments<TOptions, TMode>) => Promise<TPlugin | null>;

/** Factory contract for creating logging plugin instances. */
export interface LoggingPluginFactory<
    TPlugin extends LoggingPluginContract,
    TOptions = undefined,
    TMode extends LoggingPluginOptionsMode = 'none'
> {
    /** Creates a logging plugin instance with the provided options. */
    'create': LoggingPluginCreateFunction<TPlugin, TOptions, TMode>;
}

/** The default configuration options for logging plugins. */
export const DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS: LoggingPluginConfigurationOptions = {
    'getShouldWriteAuditLogs': void 0,
    'getShouldWriteDebugInfo': void 0,
    'getShouldWriteOperationalLogs': void 0
};
