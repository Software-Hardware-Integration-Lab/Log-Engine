export { LogEngine } from './LogEngine.js';

export { ConsoleDestination } from './plugins/ConsoleDestination.js';

export { FileDestination } from './plugins/FileDestination.js';

export { LogAnalyticsDestination } from './plugins/LogAnalyticsDestination.js';

export { AzureStorageDestination } from './plugins/AzureStorageDestination.js';

export { LogLevel } from './interfaces/LogEngine.js';

export type {
    AuditLog,
    AuditLogParameters,
    Log,
    LogEngineHostConfiguration,
    LogLevelName,
    LogRequestMetadata,
    OperationalLog,
    OperationalLogParameters
} from './interfaces/LogEngine.js';

export type {
    ConsoleDestinationMethod,
    ConsoleDestinationOptions
} from './interfaces/plugins/ConsoleDestination.js';

export type {
    FileDestinationOptions,
    FileHandlerDiagnosticReporter,
    FileLogFormat,
    SerializedAuditLog,
    SerializedLog,
    SerializedOperationalLog
} from './interfaces/plugins/FileDestination.js';

export type {
    LogAnalyticsDestinationCreateOptions,
    LogAnalyticsDestinationChannelOptions,
    LogAnalyticsUploader,
    LogAnalyticsUploaderFactory
} from './interfaces/plugins/LogAnalyticsDestination.js';

export type {
    AzureStorageDestinationOptions,
    ResolvedAzureStorageDestinationOptions
} from './interfaces/plugins/AzureStorageDestination.js';

export type { LoggingPluginContract } from './interfaces/plugins/LoggingPlugin.js';

export type { Logger } from './Logger.js';
