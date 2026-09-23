import { LogLevel } from './interfaces/LogEngine.js';
import { LogEngine } from './LogEngine.js';

export const Logger = {
    /**
     * Creates a log message with the `Trace` log level.
     * @param message The message to log.
     * @param additionalContext An optional additional context object to append to the log.
     */
    trace(message: string, additionalContext?: string | number | Date): void {
        LogEngine.getInstance().log({
            additionalContext,
            'level': LogLevel.Trace,
            message
        });
    },
    /**
     * Creates a log message with the `Debug` log level.
     * @param message The message to log.
     * @param additionalContext An optional additional context object to append to the log.
     */
    debug(message: string, additionalContext?: string | number | Date): void {
        LogEngine.getInstance().log({
            additionalContext,
            'level': LogLevel.Debug,
            message
        });
    },
    /**
     * Creates a log message with the `Information` log level.
     * @param message The message to log.
     * @param additionalContext An optional additional context object to append to the log.
     */
    info(message: string, additionalContext?: string | number | Date): void {
        LogEngine.getInstance().log({
            additionalContext,
            'level': LogLevel.Information,
            message
        });
    },
    /**
     * Creates a log message with the `Warn` log level.
     * @param message The message to log.
     * @param additionalContext An optional additional context object to append to the log.
     */
    warn(message: string, additionalContext?: string | number | Date): void {
        LogEngine.getInstance().log({
            additionalContext,
            'level': LogLevel.Warning,
            message
        });
    },
    /**
     * Creates a log message with the `Error` log level.
     * @param message The message to log.
     * @param error The error to log alongside the message.
     * @param additionalContext An optional additional context object to append to the log.
     */
    error(message: string, error?: Error, additionalContext?: string | number | Date): void {
        LogEngine.getInstance().log({
            additionalContext,
            'level': LogLevel.Error,
            message,
            'stack': error?.stack
        });
    },
    /**
     * Creates a log message with the `Critical` log level.
     * @param message The message to log.
     * @param error The error to log alongside the message.
     * @param additionalContext An optional additional context object to append to the log.
     */
    crit(message: string, error?: Error, additionalContext?: string | number | Date): void {
        LogEngine.getInstance().log({
            additionalContext,
            'level': LogLevel.Critical,
            message,
            'stack': error?.stack
        });
    }
};
