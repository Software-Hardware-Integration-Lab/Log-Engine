import { DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS, type LoggingPluginConfigurationOptions } from './LoggingPlugin.js';
import type { tags } from 'typia';
import type { LogLevelName } from '../LogEngine.js';

/** The available formats for file log output. */
export type FileLogFormat = 'formattedLog' | 'json';

/**
 * Type for a diagnostic reporter function that logs diagnostic information during file handling operations.
 */
export type FileHandlerDiagnosticReporter = (
    value: unknown,
    message: string
) => void;

/**
 * Configuration options for file destination behavior, specifying where logs
 * should be written, their formats, how frequently rotation and cleanup
 * operations occur, and which log streams are written.
 */
export interface FileDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Defines how long a log file will be kept for before it is automatically deleted. */
    'logRetentionAgeMinutes'?: number & tags.Minimum<1>;
    /** The directory that log files should be written to. */
    'outputDirectory'?: string & tags.Pattern<'^(?!\\s*$).+'>;
    /** Output formats for log files. Adding more than one output to the array will result in multiple outputs. */
    'outputFormats'?: FileLogFormat[];
    /** Defines how long a log file will be written to after creation. Once the time has expired, logs will start writing to a new file. */
    'rotationIntervalMinutes'?: number & tags.Minimum<1>;
}

/** Fully resolved options used internally by the file logging destination. */
export interface ResolvedFileDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Defines how long a log file will be kept for before it is automatically deleted. */
    'logRetentionAgeMinutes': number & tags.Minimum<1>;
    /** The directory that log files should be written to. */
    'outputDirectory': string & tags.Pattern<'^(?!\\s*$).+'>;
    /** Output formats for log files. Adding more than one output to the array will result in multiple outputs. */
    'outputFormats': FileLogFormat[];
    /** Defines how long a log file will be written to after creation. Once the time has expired, logs will start writing to a new file. */
    'rotationIntervalMinutes': number & tags.Minimum<1>;
}

/** Static default configuration used by the file destination when options are omitted. */
export const DEFAULT_FILE_DESTINATION_OPTIONS: ResolvedFileDestinationOptions = {
    ...DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS,
    'logRetentionAgeMinutes': 60 * 24,
    'outputDirectory': './logs/dev',
    'outputFormats': ['formattedLog'],
    'rotationIntervalMinutes': 60
};

/**
 * Represents the outcome of an operation, containing a success flag and
 * an optional resulting value.
 */
export interface OperationResult<T> {
    /** Indicates whether the operation was successful. */
    'success': boolean;
    /** The value resulting from the operation, if successful. */
    'value'?: T;
}

/**
 * Common structured shape returned by log serializers for JSON output.
 */
export interface SerializedLog {
    /** The optional ID provided by the client/consumer/SDK. */
    'requestId'?: string & tags.Format<'uuid'>;
    /** A UUID used to correlate logs across systems or requests. */
    'correlationId': string & tags.Format<'uuid'>;
    /** The timestamp when the log entry was created, formatted as ISO text. */
    'timeGenerated': string;
    /** Any opaque string which is a unique identifier for the current user. */
    'userId': string;
    /** The message provided by the application when the log is recorded. */
    'message': string;
    /** A UUID identifying the tenant associated with the log entry. */
    'tenantId'?: string & tags.Format<'uuid'>;
}

/**
 * Structured JSON shape returned for serialized operational logs.
 */
export interface SerializedOperationalLog extends SerializedLog {
    /** Any additional context associated with the log entry. */
    'additionalContext'?: string | number | Date;
    /** The severity or type of the log entry as a level name. */
    'level': LogLevelName | 'UNKNOWN';
    /** The stack trace of the error, if applicable. */
    'stack'?: string;
}

/**
 * Structured JSON shape returned for serialized audit logs.
 */
export interface SerializedAuditLog extends SerializedLog {
    /** The object being audited before being mutated. */
    'before': string | number | Date;
    /** The object being audited after being mutated. */
    'after': string | number | Date;
    /** The category of the audit. */
    'category': string;
}

/**
 * Contract for classes that can serialize logs for file output.
 */
export interface LogSerializer {
    /**
     * Serializes a log entry in the requested format.
     * @param format Requested output format.
     * @returns Serialized log content.
     */
    serialize(format: FileLogFormat): string;
}
