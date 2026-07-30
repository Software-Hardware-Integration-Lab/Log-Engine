import { describe, expect, it } from 'vitest';
import { getLogLevelName } from '#/helpers/LogHelpers.js';
import { LogLevel } from '#/interfaces/LogEngine.js';

describe('getLogLevelName', () => {
    it.each([
        [LogLevel.Critical, 'Critical'],
        [LogLevel.Error, 'Error'],
        [LogLevel.Warning, 'Warning'],
        [LogLevel.Information, 'Information'],
        [LogLevel.Debug, 'Debug'],
        [LogLevel.Trace, 'Trace']
    ])('should return %s when the level is %s', (level, name) => {
        expect(getLogLevelName(level)).toBe(name);
    });

    it('should return UNKNOWN when the numeric log level is unmapped', () => {
        expect(getLogLevelName(99 as LogLevel)).toBe('UNKNOWN');
    });
});
