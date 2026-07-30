import type { LoggingPluginConfigurationOptions } from './LoggingPlugin.js';

/** Structural uploader used by the package-local Log Analytics destination seam. */
export interface LogAnalyticsUploader {
    /** Uploads reshaped logs to the configured destination. */
    'upload': (ruleId: string, streamName: string, logs: Record<string, unknown>[]) => Promise<void>;
}

/** Structural uploader factory used to lazily resolve uploaders from host-provided endpoints. */
export interface LogAnalyticsUploaderFactory {
    /** Creates a structural uploader for the supplied ingestion endpoint. */
    'create': (ingestionEndpoint: string) => LogAnalyticsUploader | null;
}

/** Host-provided operational or audit upload channel configuration. */
export interface LogAnalyticsDestinationChannelOptions {
    /** Static ingestion endpoint used when runtime endpoint mutability is not needed. */
    'ingestionEndpoint'?: string;
    /** Lazily resolves the ingestion endpoint used by an uploader factory when endpoint mutability is intentionally needed. */
    'getIngestionEndpoint'?: () => string;
    /** Lazily resolves the current stream name without rebuilding the destination when stream-name mutability is intentionally needed. */
    'getStreamName'?: () => string;
    /** Stream name used when no runtime getter is supplied. */
    'streamName': string;
    /** Structural uploader supplied directly by the host application. */
    'uploader': LogAnalyticsUploader | null;
    /** Structural uploader factory supplied by the host application. */
    'uploaderFactory'?: LogAnalyticsUploaderFactory;
}

/** Explicit create options used by the package-local Log Analytics destination boundary. */
export interface LogAnalyticsDestinationCreateOptions extends LoggingPluginConfigurationOptions {
    /** Audit-upload contract supplied by the host application. */
    'audit': LogAnalyticsDestinationChannelOptions;
    /** Returns the current rule identifier without rebuilding the destination when rule mutability is intentionally needed. */
    'getRuleId'?: () => string;
    /** Operational-upload contract supplied by the host application. */
    'operational': LogAnalyticsDestinationChannelOptions;
    /** Rule identifier passed through to uploaders. */
    'ruleId': string;
}

/**
 * Configuration options for Log Analytics logging behavior.
 * All options are required and will default to the values specified in `defaultLogAnalyticsOptions` when not provided.
 */
export interface LogAnalyticsDestinationOptions {
    /** Configuration options for Azure Analytics integration. */
    'azureAnalyticsOptions': LogAnalyticsOptions;
    /** Returns whether Log Analytics logging is active. */
    'shouldWriteAuditLogs': boolean;
    /** Returns whether operational logs should be written to Log Analytics. */
    'shouldWriteOperationalLogs': boolean;
}

/** Tracks the options for Azure Analytics integration. */
export interface LogAnalyticsOptions {
    /** The endpoint for operational logs Azure Data Collection Rule. */
    'operationalLogsIngestionEndpoint': string;
    /** The endpoint for audit logs Azure Data Collection Rule. */
    'auditLogsIngestionEndpoint': string;
    /** The ID of the Azure Data Collection Rule. */
    'ruleId': string;
    /** The name of the operational log stream within the Azure Data Collection Rule. */
    'operationalLogStreamName': string;
    /** The name of the audit within the Azure Data Collection Rule. */
    'auditLogStreamName': string;
}

/** Default options for Log Analytics logging. */
export const DEFAULT_LOG_ANALYTICS_DESTINATION_OPTIONS: LogAnalyticsDestinationOptions = {
    'azureAnalyticsOptions': {
        'auditLogStreamName': '',
        'auditLogsIngestionEndpoint': '',
        'operationalLogStreamName': '',
        'operationalLogsIngestionEndpoint': '',
        'ruleId': ''
    },
    'shouldWriteAuditLogs': true,
    'shouldWriteOperationalLogs': true
};

/** Runtime-validated schema for operational log payloads sent to Azure Monitor ingestion. */
export type OperationalIngestionLog = Record<string, unknown> & {
    /** Additional context from the original operational log. */
    'AdditionalContext': Date | number | string | null;
    /** Correlation identifier shared across related logs. */
    'CorrelationId': string;
    /** String representation of the log level. */
    'Level': string;
    /** Human-readable message associated with the log. */
    'Message': string;
    /** Tenant identifier associated with the log when present. */
    'ShieldTenantId'?: string;
    /** Stack trace associated with the log when present. */
    'Stack': string | null;
    /** Timestamp used by Azure Monitor as the event time. */
    'TimeGenerated': Date;
    /** User identifier associated with the log. */
    'UserId': string;
};

/** Runtime-validated schema for audit log payloads sent to Azure Monitor ingestion. */
export type AuditIngestionLog = Record<string, unknown> & {
    /** State of the audited object after the change. */
    'After': number | string;
    /** State of the audited object before the change. */
    'Before': number | string;
    /** Audit category associated with the log. */
    'Category': string;
    /** Correlation identifier shared across related logs. */
    'CorrelationId': string;
    /** Human-readable message associated with the log. */
    'Message': string;
    /** Tenant identifier associated with the audit log when present. */
    'ShieldTenantId'?: string;
    /** Timestamp used by Azure Monitor as the event time. */
    'TimeGenerated': Date;
    /** User identifier associated with the log. */
    'UserId': string;
};
