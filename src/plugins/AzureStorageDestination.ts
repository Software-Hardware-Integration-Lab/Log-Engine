import type { OperationalLog, AuditLog } from '#/interfaces/LogEngine.js';
import { LoggingPlugin } from './base/LoggingPlugin.js';
import { DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS, type AzureAppendBlobClientLike, type AzureBlobContainerLike, type AzureStorageDestinationOptions, type ResolvedAzureStorageDestinationOptions } from '#/interfaces/plugins/AzureStorageDestination.js';
import { SerializableAuditLog } from '#/classes/SerializableAuditLog.js';
import { SerializableOperationalLog } from '#/classes/SerializableOperationalLog.js';
import { assertGuardEquals } from 'typia';

interface LogTypeCollection {
    'activeBlob': AzureAppendBlobClientLike | undefined;
    'appendQueue': Promise<void>;
    'activeBlobDate': number | undefined;
    'blobContainer': AzureBlobContainerLike | undefined;
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
            'appendQueue': Promise.resolve(),
            'activeBlobDate': void 0,
            'blobContainer': operationalLogContainer
        };

        this.#auditCollection = {
            'activeBlob': void 0,
            'appendQueue': Promise.resolve(),
            'activeBlobDate': void 0,
            'blobContainer': auditLogContainer
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
            this.#operationalCollection?.appendQueue,
            this.#auditCollection?.appendQueue
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

        // Queue the append operation to ensure sequential writes.
        const appendOperation = collection.appendQueue
            .then(async () => {
                // Check if a new blob needs to be created based on the current time.
                const timeResult = AzureStorageDestination.#shouldCreateNewBlob(collection.activeBlobDate);

                return timeResult.shouldCreate
                    ? {
                        'activeBlob': await this.#createNewBlob(type, timeResult.activeHour),
                        'activeBlobDate': timeResult.activeHour
                    }
                    : void 0;
            })
            .then((newActiveBlob) => {
                if (newActiveBlob) {
                    collection.activeBlob = newActiveBlob.activeBlob;

                    collection.activeBlobDate = newActiveBlob.activeBlobDate;
                }

                // Ensure the active blob is initialized before appending.
                if (!collection.activeBlob) {
                    throw new Error('Active blob is not initialized.');
                }

                // Append the content to the active blob and discard the result.
                return collection.activeBlob
                    .appendBlock(content, Buffer.byteLength(content))
                    .then(() => void 0);
            });

        // Keep the queue usable after an individual append failure.
        collection.appendQueue = appendOperation.catch(() => void 0);

        return appendOperation;
    }

    async #createNewBlob(type: 'audit' | 'operational', activeHour: number): Promise<AzureAppendBlobClientLike | undefined> {
        const activeHourDate = new Date(activeHour);

        // Format the blob name based on the current hour
        let blobName = activeHourDate.toISOString();

        // Construct the final blob name in the format YYYYMMDDHH.audit.log or YYYYMMDDHH.operational.log.
        blobName = `${ blobName.slice(0, 10) }${ blobName.slice(11, 13) }.${ type }.log`.replaceAll('-', '');

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
            'getShouldWriteAuditLogs': resolvedOptions.getShouldWriteAuditLogs,
            'getShouldWriteDebugInfo': resolvedOptions.getShouldWriteDebugInfo,
            'getShouldWriteOperationalLogs': resolvedOptions.getShouldWriteOperationalLogs
        };
    }

    static #shouldCreateNewBlob(currentActiveDate?: number): {
        'shouldCreate': boolean,
        'activeHour': number;
    } {
        const activeHour = new Date().setMinutes(0, 0, 0);

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
