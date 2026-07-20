import { type AuditIngestionLog, type LogAnalyticsDestinationChannelOptions, type LogAnalyticsDestinationCreateOptions, type LogAnalyticsUploader, type OperationalIngestionLog } from '#/interfaces/plugins/LogAnalyticsDestination.js';
import type { AuditLog, OperationalLog } from '#/interfaces/LogEngine.js';
import { LogEngine } from '../LogEngine.js';
import { LoggingPlugin } from './base/LoggingPlugin.js';
import { assertGuardEquals } from 'typia';

/** Cached uploader state for a single Log Analytics upload channel. */
interface LogAnalyticsDestinationChannelState {
    /** Cached ingestion endpoint used to resolve the current uploader. */
    'cachedIngestionEndpoint'?: string;
    /** Cached uploader reused while the ingestion endpoint remains unchanged. */
    'uploader': LogAnalyticsUploader | null;
}

/** Runtime shape used to inspect the optional create member on an uploader factory input. */
interface LogAnalyticsUploaderFactoryInput {
    /** Create member inspected by the custom runtime validation path. */
    'create': unknown;
}

/** Provides Log Analytics logging utilities through host-provided structural uploader contracts. */
export class LogAnalyticsDestination extends LoggingPlugin {
    /** The unique Id for the plugin. */
    declare public readonly id: string;

    /** Explicit host-provided options consumed by this destination instance. */
    readonly #options: LogAnalyticsDestinationCreateOptions;

    /** Cached audit upload-channel state. */
    readonly #auditChannelState: LogAnalyticsDestinationChannelState;

    /** Cached operational upload-channel state. */
    readonly #operationalChannelState: LogAnalyticsDestinationChannelState;

    /**
     * @param options Explicit host-provided options consumed by this destination instance.
     */
    private constructor(options: LogAnalyticsDestinationCreateOptions) {
        super(options.id ?? 'LogAnalyticsDestination');

        this.#options = options;

        this.#auditChannelState = LogAnalyticsDestination.#createChannelState(options.audit);

        this.#operationalChannelState = LogAnalyticsDestination.#createChannelState(options.operational);
    }

    /**
     * Factory method to create an instance of LogAnalyticsDestination with the provided options.
     * @param options Explicit host-provided options consumed by the destination instance.
     * @returns The instantiated class as configured by the options.
     */
    public static create(options?: LogAnalyticsDestinationCreateOptions): Promise<LogAnalyticsDestination | null> {
        try {
            if (!LogAnalyticsDestination.#isCreateOptions(options)) {
                LogAnalyticsDestination.writeConfiguredDebugInfo(options, null, 'LogAnalyticsDestination could not be created because the supplied options did not match the package-local create contract.');

                return Promise.resolve(null);
            }

            /** The configured destination instance. */
            const instance = new LogAnalyticsDestination(options);

            if (
                !LogAnalyticsDestination.#hasUsableUploadChannel(options.operational, instance.#operationalChannelState) &&
                !LogAnalyticsDestination.#hasUsableUploadChannel(options.audit, instance.#auditChannelState)
            ) {
                instance.#writeDebugInfo(null, 'LogAnalyticsDestination could not be created because the runtime did not provide usable structural uploaders.');

                return Promise.resolve(null);
            }

            return Promise.resolve(instance);
        } catch (error: unknown) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            LogAnalyticsDestination.writeConfiguredDebugInfo(options, error, message);

            return Promise.resolve(null);
        }
    }

    public override dispose(): void {
        // Intentional no-op. LogAnalyticsDestination does not have any dangling operations to clean up.
    }

    /**
     * Logs an audit log entry.
     * @param log Audit log object to be logged.
     */
    public async auditLog(log: AuditLog): Promise<void> {
        // #region Input validation
        assertGuardEquals(log);
        // #endregion Input validation

        try {
            // Skip audit log output when audit log writing is explicitly disabled for this destination instance.
            if (
                this.#options.getShouldWriteAuditLogs &&
                !this.#options.getShouldWriteAuditLogs()
            ) {
                return;
            }

            /** Structural uploader resolved for audit logs. */
            const uploader = LogAnalyticsDestination.#getUploader(this.#options.audit, this.#auditChannelState);

            if (!uploader) {
                this.#writeDebugInfo(null, 'LogAnalyticsDestination cannot submit audit logs because the runtime did not provide a usable audit uploader.');

                return;
            }

            /** Logs reshaped to match the required audit DCR stream schema. */
            const formattedLogs: AuditIngestionLog[] = [
                {
                    'After': log.after instanceof Date ? log.after.toISOString() : log.after,
                    'Before': log.before instanceof Date ? log.before.toISOString() : log.before,
                    'Category': log.category,
                    'CorrelationId': log.correlationId,
                    'Message': log.message,
                    'ShieldTenantId': log.tenantId,
                    'TimeGenerated': log.timeGenerated,
                    'UserId': log.userId
                }
            ];

            // #region Input validation
            assertGuardEquals<AuditIngestionLog[]>(formattedLogs);
            // #endregion Input validation

            await uploader.upload(this.#getRuleId(), LogAnalyticsDestination.#getStreamName(this.#options.audit), formattedLogs);
        } catch (error) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            this.#writeDebugInfo(error, `AUDIT LOG FAILED! ${ message }`);
        }
    }

    /**
     * Logs a given log object to the configured structural uploader.
     * @param log Log object to be logged.
     */
    public async log(log: OperationalLog): Promise<void> {
        // #region Input validation
        assertGuardEquals(log);
        // #endregion Input validation

        try {
            // Skip operational log output when operational log writing is explicitly disabled for this destination instance.
            if (
                this.#options.getShouldWriteOperationalLogs &&
                !this.#options.getShouldWriteOperationalLogs()
            ) {
                return;
            }

            /** Structural uploader resolved for operational logs. */
            const uploader = LogAnalyticsDestination.#getUploader(this.#options.operational, this.#operationalChannelState);

            if (!uploader) {
                this.#writeDebugInfo(null, 'LogAnalyticsDestination cannot submit logs because the runtime did not provide a usable operational uploader.');

                return;
            }

            /** Logs reshaped to match the required DCR stream schema. */
            const formattedLogs: OperationalIngestionLog[] = [
                {
                    'AdditionalContext': log.additionalContext ?? null,
                    'CorrelationId': log.correlationId,
                    'Level': LogEngine.getNameFromLogLevel(log.level) ?? 'UNKNOWN',
                    'Message': log.message,
                    'ShieldTenantId': log.tenantId,
                    'Stack': log.stack ?? null,
                    'TimeGenerated': log.timeGenerated,
                    'UserId': log.userId
                }
            ];

            // #region Input validation
            assertGuardEquals<OperationalIngestionLog[]>(formattedLogs);
            // #endregion Input validation

            await uploader.upload(this.#getRuleId(), LogAnalyticsDestination.#getStreamName(this.#options.operational), formattedLogs);
        } catch (error) {
            /** Error message if present. */
            const message = error instanceof Error ? error.message : String(error);

            this.#writeDebugInfo(error, message);
        }
    }

    /**
     * Resolves the current rule identifier.
     * @returns The current rule identifier.
     */
    #getRuleId(): string {
        return this.#options.getRuleId?.() ?? this.#options.ruleId;
    }

    /**
     * Resolves the current stream name for the provided upload channel.
     * @param channelOptions Host-provided upload channel configuration.
     * @returns The current stream name for the provided upload channel.
     */
    static #getStreamName(channelOptions: LogAnalyticsDestinationChannelOptions): string {
        return channelOptions.getStreamName?.() ?? channelOptions.streamName;
    }

    /**
     * Resolves the current ingestion endpoint for the provided upload channel.
     * @param channelOptions Host-provided upload channel configuration.
     * @returns The current ingestion endpoint for the provided upload channel.
     */
    static #getIngestionEndpoint(channelOptions: LogAnalyticsDestinationChannelOptions): string | undefined {
        return channelOptions.getIngestionEndpoint?.() ?? channelOptions.ingestionEndpoint;
    }

    /**
     * Resolves a structural uploader for the provided upload channel.
     * @param channelOptions Host-provided upload channel configuration.
     * @param channelState Cached upload-channel state for the provided upload channel.
     * @returns A structural uploader when one can be resolved; otherwise null.
     */
    static #getUploader(
        channelOptions: LogAnalyticsDestinationChannelOptions,
        channelState: LogAnalyticsDestinationChannelState
    ): LogAnalyticsUploader | null {
        if (channelOptions.uploader) {
            return channelOptions.uploader;
        }

        if (!channelOptions.uploaderFactory) {
            return null;
        }

        /** Current ingestion endpoint used to resolve a structural uploader. */
        const ingestionEndpoint = LogAnalyticsDestination.#getIngestionEndpoint(channelOptions);

        if (!ingestionEndpoint) {
            return null;
        }

        if (channelState.cachedIngestionEndpoint === ingestionEndpoint &&
            channelState.uploader !== null
        ) {
            return channelState.uploader;
        }

        const resolvedUploader = channelOptions.uploaderFactory.create(ingestionEndpoint);

        channelState.cachedIngestionEndpoint = ingestionEndpoint;

        channelState.uploader = resolvedUploader;

        return resolvedUploader;
    }

    /**
     * Determines whether the provided upload channel can currently resolve a structural uploader.
     * @param channelOptions Host-provided upload channel configuration.
     * @param channelState Cached upload-channel state for the provided upload channel.
     * @returns True when the provided upload channel can currently resolve a structural uploader.
     */
    static #hasUsableUploadChannel(
        channelOptions: LogAnalyticsDestinationChannelOptions,
        channelState: LogAnalyticsDestinationChannelState
    ): boolean {
        return LogAnalyticsDestination.#getUploader(channelOptions, channelState) !== null;
    }

    /**
     * Writes destination-local debug output through the injected runtime predicate.
     * @param object The object to log for inspection.
     * @param message An optional message to log before the object.
     */
    #writeDebugInfo(object?: unknown, message?: unknown): void {
        LogAnalyticsDestination.writeConfiguredDebugInfo(this.#options, object, message);
    }

    /**
     * Determines whether the provided value matches the explicit create options contract.
     * @param options Value supplied to the package-local create API.
     * @returns True when the provided value matches the explicit create options contract.
     */
    static #isCreateOptions(options: unknown): options is LogAnalyticsDestinationCreateOptions {
        if (typeof options !== 'object' || options === null) {
            return false;
        }

        /** Runtime view used to validate create-option members. */
        const optionsInput = options as Partial<LogAnalyticsDestinationCreateOptions>;

        return LogAnalyticsDestination.#isUploadChannel(optionsInput.audit) &&
            (
                typeof optionsInput.getShouldWriteAuditLogs === 'undefined' ||
                typeof optionsInput.getShouldWriteAuditLogs === 'function'
            ) &&
            (
                typeof optionsInput.getRuleId === 'undefined' ||
                typeof optionsInput.getRuleId === 'function'
            ) &&
            (
                typeof optionsInput.getShouldWriteDebugInfo === 'undefined' ||
                typeof optionsInput.getShouldWriteDebugInfo === 'function'
            ) &&
            (
                typeof optionsInput.getShouldWriteOperationalLogs === 'undefined' ||
                typeof optionsInput.getShouldWriteOperationalLogs === 'function'
            ) &&
            LogAnalyticsDestination.#isUploadChannel(optionsInput.operational) &&
            typeof optionsInput.ruleId === 'string';
    }

    /**
     * Determines whether the provided value matches the upload-channel contract.
     * @param channelOptions Value supplied to the package-local create API.
     * @returns True when the provided value matches the upload-channel contract.
     */
    static #isUploadChannel(channelOptions: unknown): channelOptions is LogAnalyticsDestinationChannelOptions {
        if (typeof channelOptions !== 'object' || channelOptions === null) {
            return false;
        }

        /** Runtime view used to validate upload-channel members. */
        const channelOptionsInput = channelOptions as Partial<LogAnalyticsDestinationChannelOptions>;

        return (
            typeof channelOptionsInput.ingestionEndpoint === 'undefined' ||
            typeof channelOptionsInput.ingestionEndpoint === 'string'
        ) &&
            (
                typeof channelOptionsInput.getIngestionEndpoint === 'undefined' ||
                typeof channelOptionsInput.getIngestionEndpoint === 'function'
            ) &&
            (
                typeof channelOptionsInput.getStreamName === 'undefined' ||
                typeof channelOptionsInput.getStreamName === 'function'
            ) &&
            typeof channelOptionsInput.streamName === 'string' &&
            (channelOptionsInput.uploader === null || LogAnalyticsDestination.#isUploader(channelOptionsInput.uploader)) &&
            (
                typeof channelOptionsInput.uploaderFactory === 'undefined' ||
                LogAnalyticsDestination.#isUploaderFactory(channelOptionsInput.uploaderFactory)
            );
    }

    /**
     * Determines whether the provided value matches the structural uploader contract.
     * @param uploader Value supplied to the package-local create API.
     * @returns True when the provided value matches the structural uploader contract.
     */
    static #isUploader(uploader: unknown): uploader is LogAnalyticsUploader {
        return typeof uploader === 'object' &&
            uploader !== null &&
            typeof (uploader as LogAnalyticsUploader).upload === 'function';
    }

    /**
     * Determines whether the provided value matches the structural uploader-factory contract.
     * @param uploaderFactory Value supplied to the package-local create API.
     * @returns True when the provided value matches the structural uploader-factory contract.
     */
    static #isUploaderFactory(uploaderFactory: unknown): boolean {
        return typeof uploaderFactory === 'object' &&
            uploaderFactory !== null &&
            typeof (uploaderFactory as LogAnalyticsUploaderFactoryInput).create === 'function';
    }

    /**
     * Creates cached upload-channel state for the provided channel options.
     * @param channelOptions Host-provided upload channel configuration.
     * @returns Cached upload-channel state for the provided channel options.
     */
    static #createChannelState(channelOptions: LogAnalyticsDestinationChannelOptions): LogAnalyticsDestinationChannelState {
        return {
            'cachedIngestionEndpoint': void 0,
            'uploader': channelOptions.uploader
        };
    }
}
