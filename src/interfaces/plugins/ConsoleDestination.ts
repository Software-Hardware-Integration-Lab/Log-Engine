import { DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS, type LoggingPluginConfigurationOptions } from './LoggingPlugin.js';
import { LogLevel } from '../LogEngine.js';

/** Supported console methods for console destination output. */
export type ConsoleDestinationMethod = 'log' | 'warn' | 'error';

/** Level-to-console-method overrides for operational log output. */
export type ConsoleDestinationLogLevelMap = Partial<Record<LogLevel, ConsoleDestinationMethod>>;

/** Configurable options for the console logging destination. */
export interface ConsoleDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Per-level console method overrides for operational log output. */
    'logLevelToConsoleMethod'?: ConsoleDestinationLogLevelMap;
    /**
     * Flag to dictate if timestamp should be shown on logs. Best turned off if your console already has timestamps.
     * Defaults to true.
     */
    'enableTimestamps'?: boolean;
}

/** Fully resolved options used internally by the console logging destination. */
export interface ResolvedConsoleDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Fully resolved level-to-console-method routing for operational log output. */
    'logLevelToConsoleMethod': Record<LogLevel, ConsoleDestinationMethod>;
    /**
     * Flag to dictate if timestamp should be shown on logs. Best turned off if your console already has timestamps.
     * Defaults to true.
     */
    'enableTimestamps': boolean;
}

/** Default level-to-console-method routing used by the console destination. */
export const DEFAULT_CONSOLE_DESTINATION_LOG_LEVEL_MAP: Record<LogLevel, ConsoleDestinationMethod> = {
    [LogLevel.Critical]: 'error',
    [LogLevel.Error]: 'error',
    [LogLevel.Warning]: 'warn',
    [LogLevel.Information]: 'log',
    [LogLevel.Debug]: 'log',
    [LogLevel.Trace]: 'log'
};

/** Default configuration values used by the console destination. */
export const DEFAULT_CONSOLE_DESTINATION_OPTIONS: ResolvedConsoleDestinationOptions = {
    ...DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS,
    'logLevelToConsoleMethod': { ...DEFAULT_CONSOLE_DESTINATION_LOG_LEVEL_MAP },
    'enableTimestamps': true
};
