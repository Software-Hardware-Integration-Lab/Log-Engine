import type { AppendBlobClient, ContainerClient } from '@azure/storage-blob';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AzureStorageDestination } from '#/plugins/AzureStorageDestination.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';

const uuid = '00000000-0000-0000-0000-000000000001';

const operational: OperationalLog = {
    'additionalContext': void 0,
    'correlationId': uuid,
    'level': LogLevel.Information,
    'message': 'operational entry',
    'requestId': void 0,
    'stack': void 0,
    'tenantId': void 0,
    'timeGenerated': new Date('2025-01-02T03:04:05.678Z'),
    'userId': 'user'
};

const audit: AuditLog = {
    'after': 'new',
    'before': 'old',
    'category': 'Update',
    'correlationId': uuid,
    'message': 'audit entry',
    'requestId': void 0,
    'tenantId': void 0,
    'timeGenerated': new Date('2025-01-02T03:04:05.678Z'),
    'userId': 'user'
};

interface BlobContainerTestDouble {
    'appendBlock': ReturnType<typeof vi.fn>;
    'blobNames': string[];
    'createIfNotExists': ReturnType<typeof vi.fn>;
    'container': ContainerClient;
}

function createContainer(): BlobContainerTestDouble {
    const appendBlock = vi.fn(() => Promise.resolve({}));

    const blobNames: string[] = [];

    const appendBlob = {
        'appendBlock': appendBlock,
        'createIfNotExists': vi.fn(() => Promise.resolve({ 'succeeded': true }))
    } as unknown as AppendBlobClient;

    const createIfNotExists = vi.fn(() => Promise.resolve({ 'succeeded': true }));

    const container = {
        createIfNotExists,
        'getAppendBlobClient': vi.fn((name: string) => {
            blobNames.push(name);

            return appendBlob;
        })
    } as unknown as ContainerClient;

    return {
        appendBlock,
        blobNames,
        createIfNotExists,
        container
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('AzureStorageDestination', () => {
    it('should initialize supplied containers and append JSON Lines to separate stream blobs', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-02T03:04:05.678Z'));

        const operationalContainer = createContainer();
        const auditContainer = createContainer();

        const destination = await AzureStorageDestination.create(operationalContainer.container, auditContainer.container);

        await destination.log(operational);
        await destination.auditLog(audit);

        expect(operationalContainer.createIfNotExists).toHaveBeenCalledOnce();
        expect(auditContainer.createIfNotExists).toHaveBeenCalledOnce();
        expect(operationalContainer.blobNames).toEqual(['2025010203.operational.log']);
        expect(auditContainer.blobNames).toEqual(['2025010203.audit.log']);

        const [[operationalContent, operationalContentLength]] = operationalContainer.appendBlock.mock.calls as [[string, number]];
        const [[auditContent, auditContentLength]] = auditContainer.appendBlock.mock.calls as [[string, number]];

        expect(operationalContent).toMatch(/\n$/u);
        expect(JSON.parse(operationalContent)).toMatchObject({ 'message': 'operational entry' });
        expect(operationalContentLength).toBe(new TextEncoder().encode(operationalContent).byteLength);
        expect(auditContent).toMatch(/\n$/u);
        expect(JSON.parse(auditContent)).toMatchObject({ 'message': 'audit entry' });
        expect(auditContentLength).toBe(new TextEncoder().encode(auditContent).byteLength);
    });

    it('should reuse a stream blob within the current hour and rotate it in the next hour', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-02T03:04:05.678Z'));

        const operationalContainer = createContainer();
        const destination = await AzureStorageDestination.create(operationalContainer.container);

        await destination.log(operational);
        await destination.log(operational);

        vi.setSystemTime(new Date('2025-01-02T04:00:00.000Z'));

        await destination.log(operational);

        expect(operationalContainer.blobNames).toEqual([
            '2025010203.operational.log',
            '2025010204.operational.log'
        ]);
        expect(operationalContainer.appendBlock).toHaveBeenCalledTimes(3);
    });

    it('should skip disabled streams without appending records', async () => {
        const operationalContainer = createContainer();
        const destination = await AzureStorageDestination.create(operationalContainer.container, void 0, {
            'getShouldWriteAuditLogs': () => false
        });

        await destination.auditLog(audit);

        expect(operationalContainer.appendBlock).not.toHaveBeenCalled();
    });

    it('should reject invalid containers and configurations during creation', async () => {
        const operationalContainer = createContainer();

        await expect(AzureStorageDestination.create()).rejects.toThrow('At least one');
        await expect(AzureStorageDestination.create({} as ContainerClient)).rejects.toThrow('operationalLogContainer');
        await expect(AzureStorageDestination.create(void 0, {} as ContainerClient)).rejects.toThrow('auditLogContainer');
        await expect(AzureStorageDestination.create(operationalContainer.container, void 0, {
            'maxAppendBlockBytes': 0 as never
        })).rejects.toThrow();
    });

    it('should reject unsuccessful operational and audit container initialization', async () => {
        const operationalContainer = createContainer();
        const auditContainer = createContainer();

        operationalContainer.createIfNotExists.mockRejectedValueOnce(new Error('operational init failed'));
        auditContainer.createIfNotExists.mockRejectedValueOnce(new Error('audit init failed'));

        await expect(AzureStorageDestination.create(operationalContainer.container))
            .rejects.toThrow('Failed to create or access the Azure Storage Blob container (operational).');
        await expect(AzureStorageDestination.create(void 0, auditContainer.container))
            .rejects.toThrow('Failed to create or access the Azure Storage Blob container (audit).');
    });

    it('should report a missing stream container without throwing to the caller', async () => {
        const operationalContainer = createContainer();
        const diagnostic = vi.spyOn(console, 'log').mockImplementation(() => void 0);
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => void 0);
        const destination = await AzureStorageDestination.create(operationalContainer.container, void 0, {
            'getShouldWriteDebugInfo': () => true
        });

        await expect(destination.auditLog(audit)).resolves.toBeUndefined();

        expect(debug).toHaveBeenCalledWith('Failed to access the audit log collection.');
        expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('Active blob is not initialized.'));
    });

    it('should report append failures and continue processing later records', async () => {
        const error = new Error('append failed');
        const operationalContainer = createContainer();

        operationalContainer.appendBlock
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({});

        const diagnostic = vi.spyOn(console, 'log').mockImplementation(() => void 0);
        const destination = await AzureStorageDestination.create(operationalContainer.container, void 0, {
            'getShouldWriteDebugInfo': () => true
        });

        await destination.log(operational);
        await destination.log(operational);

        expect(operationalContainer.appendBlock).toHaveBeenCalledTimes(2);
        expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('Failed to append operational log'));
        expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('append failed'));
    });

    it('should report oversized records without creating an append blob', async () => {
        const operationalContainer = createContainer();
        const diagnostic = vi.spyOn(console, 'log').mockImplementation(() => void 0);
        const destination = await AzureStorageDestination.create(operationalContainer.container, void 0, {
            'getShouldWriteDebugInfo': () => true,
            'maxAppendBlockBytes': 1
        });

        await destination.log(operational);

        expect(operationalContainer.blobNames).toEqual([]);
        expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('configured maximum is 1 bytes'));
    });

    it('should let queued appends finish and ignore records submitted after disposal', async () => {
        let finishAppend: (() => void) | undefined;

        const operationalContainer = createContainer();

        operationalContainer.appendBlock.mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishAppend = resolve;
        }));

        const destination = await AzureStorageDestination.create(operationalContainer.container);

        const firstLog = destination.log(operational);

        await vi.waitFor(() => expect(operationalContainer.appendBlock).toHaveBeenCalledOnce());

        destination.dispose();

        const laterLog = destination.log(operational);

        finishAppend?.();

        await Promise.all([firstLog, laterLog]);

        expect(operationalContainer.appendBlock).toHaveBeenCalledOnce();
    });
});
