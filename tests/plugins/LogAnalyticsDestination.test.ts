import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogAnalyticsDestination } from '#/plugins/LogAnalyticsDestination.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';
import type { LogAnalyticsDestinationCreateOptions, LogAnalyticsUploader } from '#/interfaces/plugins/LogAnalyticsDestination.js';

const uuid = '00000000-0000-0000-0000-000000000001';

const now = new Date('2025-01-02T03:04:05.678Z');

const operational: OperationalLog = {
    'additionalContext': void 0,
    'correlationId': uuid,
    'level': LogLevel.Error,
    'message': 'failed',
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
    'message': 'audited',
    'requestId': void 0,
    'tenantId': void 0,
    'timeGenerated': now,
    'userId': 'user'
};

function options(uploader: LogAnalyticsUploader | null): LogAnalyticsDestinationCreateOptions {
    return {
        'audit': {
            'streamName': 'AuditStream',
            uploader
        },
        'operational': {
            'streamName': 'OperationalStream',
            uploader
        },
        'ruleId': 'rule-id'
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LogAnalyticsDestination', () => {
    it('should reject invalid options and configurations with no usable upload channels', async () => {
        expect(await LogAnalyticsDestination.create()).toBeNull();

        expect(await LogAnalyticsDestination.create({} as never)).toBeNull();

        expect(await LogAnalyticsDestination.create(options(null))).toBeNull();
    });

    it.each([
        {
            ...options(null),
            'audit': {
                'streamName': 1,
                'uploader': null
            }
        },
        {
            ...options(null),
            'operational': {
                'streamName': 'OperationalStream',
                'uploader': {}
            }
        },
        {
            ...options(null),
            'audit': {
                'streamName': 'AuditStream',
                'uploader': null,
                'uploaderFactory': {}
            }
        },
        {
            ...options(null),
            'getRuleId': 'not-a-function'
        }
    ])('should reject malformed create-option combinations', async (invalidOptions) => {
        await expect(LogAnalyticsDestination.create(invalidOptions as never)).resolves.toBeNull();
    });

    it('should upload reshaped operational and audit payloads through direct uploaders', async () => {
        const uploader: LogAnalyticsUploader = { 'upload': vi.fn().mockResolvedValue(void 0) };

        const destination = await LogAnalyticsDestination.create(options(uploader));

        await destination!.log(operational);

        await destination!.auditLog(audit);

        expect(uploader.upload).toHaveBeenNthCalledWith(1, 'rule-id', 'OperationalStream', [
            expect.objectContaining({
                'AdditionalContext': null,
                'Level': 'Error',
                'Stack': null
            })
        ]);

        expect(uploader.upload).toHaveBeenNthCalledWith(2, 'rule-id', 'AuditStream', [
            expect.objectContaining({
                'After': 'new',
                'Before': 'old',
                'Category': 'Update'
            })
        ]);
    });

    it('should skip uploads when stream predicates disable their matching stream', async () => {
        const uploader: LogAnalyticsUploader = { 'upload': vi.fn().mockResolvedValue(void 0) };

        const destination = await LogAnalyticsDestination.create({
            ...options(uploader),
            'getShouldWriteAuditLogs': () => false,
            'getShouldWriteOperationalLogs': () => false
        });

        await destination!.log(operational);

        await destination!.auditLog(audit);

        expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('should dispose without error when no resources are held', async () => {
        const uploader: LogAnalyticsUploader = { 'upload': vi.fn().mockResolvedValue(void 0) };

        const destination = await LogAnalyticsDestination.create(options(uploader));

        expect(() => destination?.dispose()).not.toThrow();
    });

    it('should cache factory uploaders until an ingestion endpoint changes and use dynamic identifiers', async () => {
        let endpoint = 'https://one';

        let stream = 'stream-one';

        let rule = 'rule-one';

        const firstUploader: LogAnalyticsUploader = { 'upload': vi.fn().mockResolvedValue(void 0) };

        const secondUploader: LogAnalyticsUploader = { 'upload': vi.fn().mockResolvedValue(void 0) };

        // eslint-disable-next-line stylistic/no-confusing-arrow
        const factory = { 'create': vi.fn((value: string) => value === 'https://one' ? firstUploader : secondUploader) };

        const channel = {
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            'getIngestionEndpoint': () => endpoint,
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            'getStreamName': () => stream,
            'streamName': 'fallback',
            'uploader': null,
            'uploaderFactory': factory
        };

        const destination = await LogAnalyticsDestination.create({
            'audit': channel,
            'getRuleId': () => rule,
            'operational': channel,
            'ruleId': 'fallback'
        });

        await destination!.log(operational);

        endpoint = 'https://two';

        stream = 'stream-two';

        rule = 'rule-two';

        await destination!.log(operational);

        expect(factory.create).toHaveBeenCalledTimes(2);

        expect(firstUploader.upload).toHaveBeenCalledWith('rule-one', 'stream-one', expect.any(Array));

        expect(secondUploader.upload).toHaveBeenCalledWith('rule-two', 'stream-two', expect.any(Array));
    });

    it('should retry a factory when its cached uploader is null for an unchanged endpoint', async () => {
        const uploader: LogAnalyticsUploader = { 'upload': vi.fn().mockResolvedValue(void 0) };

        const operationalFactory = {
            'create': vi.fn()
                .mockReturnValueOnce(null)
                .mockReturnValueOnce(uploader)
        };

        const destination = await LogAnalyticsDestination.create({
            'audit': {
                'ingestionEndpoint': 'https://audit',
                'streamName': 'AuditStream',
                'uploader': { 'upload': vi.fn().mockResolvedValue(void 0) }
            },
            'operational': {
                'ingestionEndpoint': 'https://operational',
                'streamName': 'OperationalStream',
                'uploader': null,
                'uploaderFactory': operationalFactory
            },
            'ruleId': 'rule-id'
        });

        await destination!.log(operational);

        expect(operationalFactory.create).toHaveBeenCalledTimes(2);

        expect(operationalFactory.create).toHaveBeenNthCalledWith(1, 'https://operational');

        expect(operationalFactory.create).toHaveBeenNthCalledWith(2, 'https://operational');

        expect(uploader.upload).toHaveBeenCalledWith('rule-id', 'OperationalStream', expect.any(Array));
    });

    it('should contain uploader failures rather than reject logging calls', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const uploader: LogAnalyticsUploader = { 'upload': vi.fn().mockRejectedValue(new Error('network failure')) };

        const destination = await LogAnalyticsDestination.create({
            ...options(uploader),
            'getShouldWriteDebugInfo': () => true
        });

        await expect(destination!.log(operational)).resolves.toBeUndefined();

        expect(log).toHaveBeenCalledWith(expect.stringContaining('network failure'));
    });
});
