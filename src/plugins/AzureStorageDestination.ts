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
    'activeBlobDate': number | undefined;
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
            'activeBlobDate': void 0,
            'blobContainer': operationalLogContainer,
            'blobSuffix': 0,
            'blockCount': 0,
            'flushPromise': void 0,
            'pendingRecords': []
        };

        this.#auditCollection = {
            'activeBlob': void 0,
            'activeBlobDate': void 0,
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

                this.#operationalCollection.activeBlobDate = void 0;
            }

            if (this.#auditCollection) {
                this.#auditCollection.activeBlob = void 0;

                this.#auditCollection.activeBlobDate = void 0;
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

        await collection.activeBlob.appendBlock(content, Buffer.byteLength(content));

        collection.blockCount += 1;
    }

    /**
     * Rotates the active blob when the hour has changed or the block-count limit has been reached.
     * @param collection Operational or audit collection to evaluate.
     * @param type Discriminator identifying which collection is being rotated.
     */
    async #ensureActiveBlob(collection: LogTypeCollection, type: 'audit' | 'operational'): Promise<void> {
        const activeHour = new Date().setMinutes(0, 0, 0);

        const isNewHour = collection.activeBlobDate === void 0 || activeHour > collection.activeBlobDate;

        const isBlockLimitReached = collection.blockCount >= this.#appliedOptions.maxBlocksPerBlob;

        if (!isNewHour && !isBlockLimitReached) {
            return;
        }

        // Reset the suffix on a new hour; otherwise advance it to rotate within the same hour.
        const blobSuffix = isNewHour ? 0 : collection.blobSuffix + 1;

        const activeBlob = await this.#createNewBlob(type, activeHour, blobSuffix);

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.activeBlob = activeBlob;

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.activeBlobDate = activeHour;

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.blobSuffix = blobSuffix;

        // eslint-disable-next-line require-atomic-updates -- #ensureActiveBlob only runs within a single-flight flush per collection.
        collection.blockCount = 0;
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

    async #createNewBlob(type: 'audit' | 'operational', activeHour: number, suffix: number): Promise<AzureAppendBlobClientLike | undefined> {
        const activeHourDate = new Date(activeHour);

        const isoValue = activeHourDate.toISOString();

        // Format the blob name based on the current hour.
        const datePrefix = `${ isoValue.slice(0, 10) }${ isoValue.slice(11, 13) }`.replaceAll('-', '');

        // Append a numeric suffix (e.g. .2, .3) when rotating within the same hour due to the block-count limit.
        const suffixSegment = suffix > 0 ? `.${ suffix + 1 }` : '';

        // Construct the final blob name in the format YYYYMMDDHH.audit.log or YYYYMMDDHH.operational.log.
        const blobName = `${ datePrefix }.${ type }${ suffixSegment }.log`;

        const collection = type === 'audit' ? this.#auditCollection : this.#operationalCollection;

        if (!collection?.blobContainer) {
            // Todo - log internal don't throw
            this.#writeDebugLog(`Failed to access the ${ type } log collection.`);

            return void 0;
        }

        const blobClient = collection.blobContainer.getAppendBlobClient(blobName);

        const result = await blobClient.createIfNotExists();

        if (result.errorCode) {
            this.#writeDebugLog('Failed to create new blob:', result.errorCode);
        }

        return blobClient;
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

    static #shouldCreateNewBlob(currentActiveDate?: number): {
        'shouldCreate': boolean,
        'activeHour': number;
    } {
        const activeHour = new Date().setUTCMinutes(0, 0, 0);

        return {
            activeHour,
            'shouldCreate': currentActiveDate === void 0 || activeHour > currentActiveDate
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
