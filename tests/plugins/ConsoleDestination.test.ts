import { afterEach, assert, describe, expect, it, test, vi } from 'vitest';
import { ConsoleDestination } from '#/plugins/ConsoleDestination.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';
import { ConsoleDestinationOptions } from '../../bin/interfaces/plugins/ConsoleDestination';

const uuid = '00000000-0000-0000-0000-000000000001';

const now = new Date('2025-01-02T03:04:05.678Z');

const operational: OperationalLog = {
    'additionalContext': void 0,
    'correlationId': uuid,
    'level': LogLevel.Warning,
    'message': 'warning',
    'requestId': void 0,
    'stack': void 0,
    'tenantId': void 0,
    'timeGenerated': now,
    'userId': 'user'
};

const audit: AuditLog = {
    'after': 'new',
    'before': 'old',
    'category': 'Update',
    'correlationId': uuid,
    'message': 'changed',
    'requestId': void 0,
    'tenantId': void 0,
    'timeGenerated': now,
    'userId': 'user'
};

interface FormatTestParams {
    'name': string,
    'log': OperationalLog,
    'expected': string;
    'options'?: ConsoleDestinationOptions;
}

afterEach(() => {
    vi.restoreAllMocks();
});

const paramTestString = '2025-01-02 03:04:05.678: WARNING | warning | correlationId: 00000000-0000-0000-0000-000000000001 | userId: user';

describe('ConsoleDestination', () => {
    test.each([
        {
            'name': 'should not log undefined additional context',
            'log': operational,
            'expected': paramTestString,
        },
        {
            'name': 'should not log timestamp when disabled by options',
            'log': operational,
            'expected': paramTestString.substring(25),
            'options': { enableTimestamps: false }
        },
        {
            'name': 'should include request id when defined',
            'log': { ...operational, 'requestId': '00000000-0000-0000-0000-000000000002' },
            'expected': paramTestString + ' | requestId: 00000000-0000-0000-0000-000000000002'
        },
        {
            'name': 'should include tenant id when defined',
            'log': { ...operational, 'tenantId': '00000000-0000-0000-0000-000000000003' },
            'expected': paramTestString + ' | tenantId: 00000000-0000-0000-0000-000000000003'
        },
        {
            'name': 'should include error stack on new line when defined',
            'log': { ...operational, 'stack': 'test error stack' },
            'expected': paramTestString + '\ntest error stack'
        },
        {
            'name': 'should log invalid additional context json object as string',
            'log': { ...operational, 'additionalContext': '<bing<<bong:!' },
            'expected': paramTestString + ' | additionalContext: <bing<<bong:!'
        },
        {
            'name': 'should log number additional context',
            'log': { ...operational, 'additionalContext': 1 },
            'expected': paramTestString + ' | additionalContext: 1'
        },
        {
            'name': 'should log date additional context as ISO string',
            'log': { ...operational, 'additionalContext': new Date(2025, 1, 1) },
            'expected': paramTestString + ` | additionalContext: ${ new Date(2025, 1, 1).toISOString() }`
        }
    ] satisfies FormatTestParams[])('[Theory] $name', async ({ log, expected, options }) => {
        const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create(options);

        expect(destination).not.toBeNull();

        await destination!.log(log);

        expect(logSpy).toHaveBeenCalledTimes(1);

        const actual = logSpy.mock.calls[0][0];

        expect(actual).toBe(expected);
    });

    it('should log only defined additional context properties', async () => {
        const withContext = {
            ...operational,
            'additionalContext': JSON.stringify({
                'bar': void 0,
                'foo': 'hello'
            })
        } satisfies OperationalLog;

        const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create();

        expect(destination).not.toBeNull();

        await destination!.log(withContext);

        expect(logSpy).toHaveBeenCalledTimes(1);

        const expectedString = [
            '2025-01-02 03:04:05.678: WARNING | warning | correlationId: 00000000-0000-0000-0000-000000000001 | userId: user',
            ' | foo: hello'
        ].join('');

        const actual = logSpy.mock.calls[0][0];

        expect(actual).toBe(expectedString);
    });

    it('should route operational levels and audit logs to their configured console methods', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create();

        expect(destination).not.toBeNull();

        await destination!.log(operational);

        await destination!.auditLog(audit);

        expect(warn).toHaveBeenCalledWith('2025-01-02 03:04:05.678: WARNING | warning | correlationId: 00000000-0000-0000-0000-000000000001 | userId: user', void 0);

        expect(log).toHaveBeenCalledWith('2025-01-02 03:04:05.678: AUDIT : Update changed', audit);
    });

    it('should skip the applicable stream when its write predicate returns false', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create({
            'getShouldWriteAuditLogs': () => false,
            'getShouldWriteOperationalLogs': () => false,
            'enableTimestamps': true
        });

        await destination!.log(operational);

        await destination!.auditLog(audit);

        expect(log).not.toHaveBeenCalled();

        expect(error).not.toHaveBeenCalled();
    });

    it('should apply level routing overrides when a destination option provides one', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create({ 'logLevelToConsoleMethod': { [LogLevel.Warning]: 'error' } });

        await destination!.log(operational);

        expect(error).toHaveBeenCalledWith('2025-01-02 03:04:05.678: WARNING | warning | correlationId: 00000000-0000-0000-0000-000000000001 | userId: user', void 0);
    });

    it('should dispose without error when no resources are held', async () => {
        const destination = await ConsoleDestination.create();

        expect(() => destination?.dispose()).not.toThrow();
    });

    it('should throw synchronously when the option map contains an invalid method', () => {
        expect(() => ConsoleDestination.create({
            'logLevelToConsoleMethod': { [LogLevel.Warning]: 'write' as never }
        })).toThrow();
    });
});
