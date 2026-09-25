import type { OperationalLog, AuditLog } from '#/interfaces/LogEngine.js';
import { LoggingPlugin } from './base/LoggingPlugin.js';
import { DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS, type AzureAppendBlobClientLike, type AzureBlobContainerLike, type AzureStorageDestinationOptions, type ResolvedAzureStorageDestinationOptions } from '#/interfaces/plugins/AzureStorageDestination.js';
import { SerializableAuditLog } from '#/classes/SerializableAuditLog.js';
import { SerializableOperationalLog } from '#/classes/SerializableOperationalLog.js';
import { assertGuardEquals } from 'typia';

/** A queued log record awaiting a batched append, along with its caller-facing settlement. */
interface PendingLogRecord {
    'content': string;
    'reject': (error: unknown) => void;
    'resolve': () => void;
}

interface LogTypeCollection {
    'activeBlob': AzureAppendBlobClientLike | undefined;
    'activeWindowStart': number | undefined;
    /** Suffix applied to the blob name when rotating within the same hour due to the block-count limit. */
    'blobSuffix': number;
    'blobContainer': AzureBlobContainerLike | undefined;
    /** Number of append blocks already written to the active blob. */
    'blockCount': number;
    /** In-flight batch flush; new records arriving while set are picked up by the next flush. */
    'flushPromise': Promise<void> | undefined;
    'pendingRecords': PendingLogRecord[];
}

/**
 * Azure Storage destination for operational and audit logs.
 * Utilizes Azure Blob Storage append blobs for log storage.
 */
export class AzureStorageDestination extends LoggingPlugin {
    /** Upper bound on suffix advances while searching for a non-full blob, guarding against an unbounded loop. */
    static readonly #maxBlobRotationAttempts = 1000;

    readonly #operationalCollection: LogTypeCollection | undefined = void 0;
    readonly #auditCollection: LogTypeCollection | undefined = void 0;
    readonly #appliedOptions: ResolvedAzureStorageDestinationOptions;
    #isDisposed = false;

    private constructor(
        operationalLogContainer?: AzureBlobContainerLike,
        auditLogContainer?: AzureBlobContainerLike,
        configuration: AzureStorageDestinationOptions = DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS
    ) {
        super(configuration.id ?? 'AzureStorageDestination');

        this.#appliedOptions = AzureStorageDestination.#resolveConfigurationOptions(configuration);

        this.#operationalCollection = {
            'activeBlob': void 0,
            'activeWindowStart': void 0,
            'blobContainer': operationalLogContainer,
            'blobSuffix': 0,
            'blockCount': 0,
            'flushPromise': void 0,
            'pendingRecords': []
        };

        this.#auditCollection = {
            'activeBlob': void 0,
            'activeWindowStart': void 0,
            'blobContainer': auditLogContainer,
            'blobSuffix': 0,
            'blockCount': 0,
            'flushPromise': void 0,
            'pendingRecords': []
        };
    }

    /**
     * Creates an Azure Storage destination backed by one or both supplied blob containers.
     * @param operationalLogContainer Optional Azure Blob container for operational logs.
     * @param auditLogContainer Optional Azure Blob container for audit logs.
     * @param configuration Optional base configuration that controls log and diagnostic output.
     * @returns Initialized Azure Storage destination.
     */
    public static async create(
        operationalLogContainer?: AzureBlobContainerLike,
        auditLogContainer?: AzureBlobContainerLike,
        configuration: AzureStorageDestinationOptions = DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS
    ): Promise<AzureStorageDestination> {
        if (!operationalLogContainer && !auditLogContainer) {
            throw new Error('At least one of operationalLogContainer or auditLogContainer must be provided.');
        }

        if (operationalLogContainer && !AzureStorageDestination.#isContainerClient(operationalLogContainer)) {
            throw new TypeError('operationalLogContainer must be an Azure Blob ContainerClient.');
        }

        if (auditLogContainer && !AzureStorageDestination.#isContainerClient(auditLogContainer)) {
            throw new TypeError('auditLogContainer must be an Azure Blob ContainerClient.');
        }

        const resolvedOptions = AzureStorageDestination.#resolveConfigurationOptions(configuration);

        if (operationalLogContainer) {
            try {
                await operationalLogContainer.createIfNotExists();
            } catch (error: unknown) {
                if (!(error instanceof Error)) {
                    throw error;
                }

                throw new Error('Failed to create or access the Azure Storage Blob container (operational).', {
                    'cause': error
                });
            }
        }

        if (auditLogContainer) {
            try {
                await auditLogContainer.createIfNotExists();
            } catch (error: unknown) {
                if (!(error instanceof Error)) {
                    throw error;
                }

                throw new Error('Failed to create or access the Azure Storage Blob container (audit).', {
                    'cause': error
                });
            }
        }

        return new AzureStorageDestination(operationalLogContainer, auditLogContainer, resolvedOptions);
    }

    public override async log(log: OperationalLog): Promise<void> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(log);
        // #endregion Input validation

        if (this.#isDisposed || (
            this.#appliedOptions.getShouldWriteOperationalLogs &&
            !this.#appliedOptions.getShouldWriteOperationalLogs()
        )
        ) {
            return;
        }

        try {
            await this.#append(
                `${ new SerializableOperationalLog(log).serialize('json') }\n`,
                'operational'
            );
        } catch (error: unknown) {
            AzureStorageDestination.writeConfiguredDebugInfo(
                this.#appliedOptions,
                error,
                'Failed to append operational log to Azure Blob Storage.'
            );
        }

        return Promise.resolve();
    }

    public override async auditLog(log: AuditLog): Promise<void> {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(log);
        // #endregion Input validation

        if (this.#isDisposed || (
            this.#appliedOptions.getShouldWriteAuditLogs &&
            !this.#appliedOptions.getShouldWriteAuditLogs()
        )
        ) {
            return;
        }

        try {
            await this.#append(
                `${ new SerializableAuditLog(log).serialize('json') }\n`,
                'audit'
            );
        } catch (error: unknown) {
            AzureStorageDestination.writeConfiguredDebugInfo(
                this.#appliedOptions,
                error,
                'Failed to append audit log to Azure Blob Storage.'
            );
        }
    }

    public override dispose(): void {
        this.#isDisposed = true;

        void Promise.all([
            this.#operationalCollection?.flushPromise,
            this.#auditCollection?.flushPromise
        ]).finally(() => {
            if (this.#operationalCollection) {
                this.#operationalCollection.activeBlob = void 0;

                this.#operationalCollection.activeWindowStart = void 0;
            }

            if (this.#auditCollection) {
                this.#auditCollection.activeBlob = void 0;

                this.#auditCollection.activeWindowStart = void 0;
            }
        });
    }

    #append(content: string, type: 'audit' | 'operational'): Promise<void> {
        if (this.#isDisposed) {
            return Promise.reject(new Error('Azure Storage destination has been disposed.'));
        }

        const collection = type === 'audit' ? this.#auditCollection : this.#operationalCollection;

        if (!collection) {
            return Promise.reject(new Error(`Failed to access the ${ type } log collection.`));
        }

        const contentSize = Buffer.byteLength(content);

        if (contentSize > this.#appliedOptions.maxAppendBlockBytes) {
            throw new RangeError(`Azure Storage append blob record is ${ contentSize } bytes; ` +
                `the configured maximum is ${ this.#appliedOptions.maxAppendBlockBytes } bytes.`);
        }

        // Queue the record; it is combined with any records batched into the same flush.
        return new Promise<void>((resolve, reject) => {
            collection.pendingRecords.push({
                content,
                reject,
                resolve
            });

            this.#scheduleFlush(collection, type);
        });
    }

    /**
     * Starts a batch flush for a collection when none is already in flight.
     * @param collection Operational or audit collection to flush.
     * @param type Discriminator identifying which collection is being flushed.
     */
    #scheduleFlush(collection: LogTypeCollection, type: 'audit' | 'operational'): void {
        if (collection.flushPromise) {
            return;
        }

        collection.flushPromise = this.#flushPending(collection, type).finally(() => {
            collection.flushPromise = void 0;

            // Records may have queued up while this flush was in flight; batch them next.
            if (collection.pendingRecords.length > 0) {
                this.#scheduleFlush(collection, type);
            }
        });
    }

    /**
     * Drains currently queued records, grouping them into append calls that respect the byte limit.
     * @param collection Operational or audit collection to flush.
     * @param type Discriminator identifying which collection is being flushed.
     */
    async #flushPending(collection: LogTypeCollection, type: 'audit' | 'operational'): Promise<void> {
        const batch = collection.pendingRecords.splice(0, collection.pendingRecords.length);

        if (batch.length === 0) {
            return;
        }

        const groups = AzureStorageDestination.#groupByByteLimit(batch, this.#appliedOptions.maxAppendBlockBytes);

        for (const group of groups) {
            try {
                await this.#writeGroup(collection, type, group);

                for (const record of group) {
                    record.resolve();
                }
            } catch (error: unknown) {
                for (const record of group) {
                    record.reject(error);
                }
            }
        }
    }

    /**
     * Writes a single group of records as one append-blob block, rotating the blob first if required.
     * @param collection Operational or audit collection to write to.
     * @param type Discriminator identifying which collection is being written.
     * @param group Records to combine into a single append-blob write.
     */
    async #writeGroup(collection: LogTypeCollection, type: 'audit' | 'operational', group: PendingLogRecord[]): Promise<void> {
        await this.#ensureActiveBlob(collection, type);

        // Ensure the active blob is initialized before appending.
        if (!collection.activeBlob) {
            throw new Error('Active blob is not initialized.');
        }

        const content = group.map((record) => record.content).join('');

        const response = await collection.activeBlob.appendBlock(content, Buffer.byteLength(content));

        // Prefer Azure's authoritative count so concurrent writers to the same blob stay in sync.
        // eslint-disable-next-line require-atomic-updates -- #writeGroup only runs within a single-flight flush per collection.
        collection.blockCount = response.blobCommittedBlockCount ?? collection.blockCount + 1;
    }

    /**
     * Rotates the active blob when the hour has changed or the block-count limit has been reached.
     * @param collection Operational or audit collection to evaluate.
     * @param type Discriminator identifying which collection is being rotated.
     */
    async #ensureActiveBlob(collection: LogTypeCollection, type: 'audit' | 'operational'): Promise<void> {
        const activeWindow = this.#getActiveWindowStart();

        const isNewWindow = collection.activeWindowStart === void 0 || activeWindow > collection.activeWindowStart;

        const isBlockLimitReached = collection.blockCount >= this.#appliedOptions.maxBlocksPerBlob;

        if (!isNewWindow && !isBlockLimitReached) {
            return;
        }

        // Reset the suffix on a new hour; otherwise advance it to rotate within the same hour.
        let blobSuffix = isNewWindow ? 0 : collection.blobSuffix + 1;

        let openedBlob = await this.#openBlob(type, activeWindow, blobSuffix);

        let rotationAttempts = 0;

        // A reopened blob (from a prior process, or shared with another instance) may already be at capacity; skip past it.
        while (openedBlob.committedBlockCount >= this.#appliedOptions.maxBlocksPerBlob) {
            rotationAttempts += 1;

            if (rotationAttempts > AzureStorageDestination.#maxBlobRotationAttempts) {
                throw new Error(`Failed to find an available ${ type } blob after ${ AzureStorageDestination.#maxBlobRotationAttempts } rotation attempts.`);
            }

            blobSuffix += 1;

            openedBlob = await this.#openBlob(type, activeWindow, blobSuffix);
        }

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.activeBlob = openedBlob.blobClient;

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.activeWindowStart = activeWindow;

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.blobSuffix = blobSuffix;

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.blockCount = openedBlob.committedBlockCount;
    }

    /**
     * Calculates the start of the rotation window that the current time falls within, anchored to UTC midnight.
     * @returns Millisecond timestamp of the start of the active rotation window.
     */
    #getActiveWindowStart(): number {
        const now = Date.now();

        const intervalMs = this.#appliedOptions.rotationIntervalMinutes * 60_000;

        const dayStart = new Date(now).setUTCHours(0, 0, 0, 0);

        return dayStart + (Math.floor((now - dayStart) / intervalMs) * intervalMs);
    }

    /**
     * Groups queued records into batches that each fit within the configured byte limit.
     * @param batch Queued records awaiting a flush.
     * @param maxBytes Maximum number of UTF-8 bytes permitted in one append-blob write.
     * @returns Ordered groups, each of which can be safely combined into a single append-blob write.
     */
    static #groupByByteLimit(batch: PendingLogRecord[], maxBytes: number): PendingLogRecord[][] {
        const groups: PendingLogRecord[][] = [];

        let currentGroup: PendingLogRecord[] = [];

        let currentSize = 0;

        for (const record of batch) {
            const recordSize = Buffer.byteLength(record.content);

            if (currentGroup.length > 0 && currentSize + recordSize > maxBytes) {
                groups.push(currentGroup);

                currentGroup = [];

                currentSize = 0;
            }

            currentGroup.push(record);

            currentSize += recordSize;
        }

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    }

    /**
     * Creates or reopens the append blob for a given hour and suffix, recovering its true committed block
     * count when it already existed so callers can detect a blob that is already at capacity.
     * @param type Discriminator identifying which collection is being opened.
     * @param windowStart Millisecond timestamp of the start of the time window the blob belongs to.
     * @param suffix Rotation suffix applied when opening a blob other than the first one for the hour.
     * @returns The opened blob client, if the collection's container is available, alongside its true committed block count.
     */
    async #openBlob(type: 'audit' | 'operational', windowStart: number, suffix: number): Promise<{
        'blobClient': AzureAppendBlobClientLike | undefined;
        'committedBlockCount': number;
    }> {
        const isoValue = new Date(windowStart).toISOString();

        // YYYYMMDDHHmm — minute resolution is required for sub-hourly rotation intervals.
        const datePrefix = `${ isoValue.slice(0, 10).replaceAll('-', '') }${ isoValue.slice(11, 13) }${ isoValue.slice(14, 16) }`;

        // Append a numeric suffix (e.g. .2, .3) when rotating within the same hour due to the block-count limit.
        const suffixSegment = suffix > 0 ? `.${ suffix + 1 }` : '';

        // Construct the final blob name in the format YYYYMMDDHHmm.audit.log or YYYYMMDDHHmm.operational.log.
        const blobName = `${ datePrefix }.${ type }${ suffixSegment }.log`;

        const collection = type === 'audit' ? this.#auditCollection : this.#operationalCollection;

        if (!collection?.blobContainer) {
            // Todo - log internal don't throw
            this.#writeDebugLog(`Failed to access the ${ type } log collection.`);

            return {
                'blobClient': void 0,
                'committedBlockCount': 0
            };
        }

        const blobClient = collection.blobContainer.getAppendBlobClient(blobName);

        const result = await blobClient.createIfNotExists();

        if (result.errorCode) {
            this.#writeDebugLog('Failed to create new blob:', result.errorCode);
        }

        // A blob that already existed may have been written by a prior process or another instance; recover its true block count.
        if (result.succeeded === false) {
            try {
                const properties = await blobClient.getProperties();

                return {
                    blobClient,
                    'committedBlockCount': properties.blobCommittedBlockCount ?? 0
                };
            } catch (error: unknown) {
                this.#writeDebugLog('Failed to read existing blob properties:', error);
            }
        }

        return {
            blobClient,
            'committedBlockCount': 0
        };
    }

    static #isContainerClient(value: unknown): value is AzureBlobContainerLike {
        return typeof value === 'object' &&
            value !== null &&
            typeof (value as { 'createIfNotExists'?: unknown; }).createIfNotExists === 'function' &&
            typeof (value as { 'getAppendBlobClient'?: unknown; }).getAppendBlobClient === 'function';
    }

    static #resolveConfigurationOptions(configuration: AzureStorageDestinationOptions): ResolvedAzureStorageDestinationOptions {
        const resolvedOptions = AzureStorageDestination.resolveConfigurationOptions(
            configuration,
            DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS
        );

        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(resolvedOptions.validationInput as Omit<AzureStorageDestinationOptions, 'getShouldWriteAuditLogs' | 'getShouldWriteDebugInfo' | 'getShouldWriteOperationalLogs'>);
        // #endregion Input validation

        return {
            ...DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS,
            ...configuration,
            'maxAppendBlockBytes': configuration.maxAppendBlockBytes ?? DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS.maxAppendBlockBytes,
            'maxBlocksPerBlob': configuration.maxBlocksPerBlob ?? DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS.maxBlocksPerBlob,
            'getShouldWriteAuditLogs': resolvedOptions.getShouldWriteAuditLogs,
            'getShouldWriteDebugInfo': resolvedOptions.getShouldWriteDebugInfo,
            'getShouldWriteOperationalLogs': resolvedOptions.getShouldWriteOperationalLogs
        };
    }

    #writeDebugLog(message: string, ...optionalParams: unknown[]): void {
        if (
            this.#appliedOptions.getShouldWriteDebugInfo &&
            this.#appliedOptions.getShouldWriteDebugInfo()
        ) {
            // eslint-disable-next-line no-console
            console.debug(message, ...optionalParams);
        }
    }
}
