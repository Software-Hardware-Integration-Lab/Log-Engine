import { LogLevel, type LogLevelName } from '#/interfaces/LogEngine.js';
import { assertGuardEquals } from 'typia';

/**
 * Resolves the uppercase text name for a log level.
 * @param logLevel The log level to format.
 * @returns The uppercase log level name.
 */
export function getLogLevelName(logLevel: LogLevel): LogLevelName | 'UNKNOWN' {
    assertGuardEquals<number>(logLevel);

    switch (logLevel) {
        case LogLevel.Critical:
            return 'Critical';
        case LogLevel.Error:
            return 'Error';
        case LogLevel.Warning:
            return 'Warning';
        case LogLevel.Information:
            return 'Information';
        case LogLevel.Debug:
            return 'Debug';
        case LogLevel.Trace:
            return 'Trace';
        default:
            return 'UNKNOWN';
    }
}
