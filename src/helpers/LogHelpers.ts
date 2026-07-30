import { LogLevel, type LogLevelName } from '#/interfaces/LogEngine.js';
import { assertGuardEquals } from 'typia';

/**
 * Resolves the uppercase text name for a log level.
 * @param logLevel The log level to format.
 * @returns The uppercase log level name.
 */
export function getLogLevelName(logLevel: LogLevel): LogLevelName | 'UNKNOWN' {
    /* v8 ignore next */
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

/**
 * Convert a LogLevel enum value to its name.
 * @param value - The enum value to convert.
 * @returns The LogLevel name or undefined for invalid values.
 */
export function getNameFromLogLevel(value: number): string | undefined {
    // #region input validation
    assertGuardEquals(value);
    // #endregion input validation

    /** Convert the LogLevel enum value to its corresponding name. */
    const name = LogLevel[value];

    // Return the name if it's a string, otherwise return undefined for invalid values.
    return typeof name === 'string' ? name : void 0;
}
