import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleDestination } from '#/plugins/ConsoleDestination.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';

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

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ConsoleDestination', () => {
    it('should route operational levels and audit logs to their configured console methods', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create();

        expect(destination).not.toBeNull();

        await destination!.log(operational);

        await destination!.auditLog(audit);

        expect(warn).toHaveBeenCalledWith('2025-01-02 03:04:05.678: WARNING warning', operational);

        expect(log).toHaveBeenCalledWith('2025-01-02 03:04:05.678: AUDIT : Update changed', audit);
    });

    it('should skip the applicable stream when its write predicate returns false', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create({
            'getShouldWriteAuditLogs': () => false,
            'getShouldWriteOperationalLogs': () => false
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

        expect(error).toHaveBeenCalledWith('2025-01-02 03:04:05.678: WARNING warning', operational);
    });

    it('should return null and report diagnostics when the option map contains an invalid method', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const destination = await ConsoleDestination.create({
            'getShouldWriteDebugInfo': () => true,
            'logLevelToConsoleMethod': { [LogLevel.Warning]: 'write' as never }
        });

        expect(destination).toBeNull();

        expect(log).toHaveBeenCalledWith(expect.stringContaining('ConsoleDestination could not be created'));
    });
});
