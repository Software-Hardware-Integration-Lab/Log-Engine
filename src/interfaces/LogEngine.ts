import type { LogEngineHostConfiguration } from './HostConfiguration.js';
import type { LogRequestMetadata } from './RequestMetadata.js';
import type { tags } from 'typia';

/**
 * Represents the base structure of a log entry with common properties.
 * All log entries must include correlation ID, timestamp, user ID, and message.
 */
export interface Log {
    /** The optional ID provided by the client/consumer/SDK. */
    'requestId'?: string & tags.Format<'uuid'>;
    /** A UUID used to correlate logs across systems or requests. */
    'correlationId': string & tags.Format<'uuid'>;
    /** The timestamp when the log entry was created. */
    'timeGenerated': Date;
    /** Any opaque string which is a unique identifier for the current user. */
    'userId': string;
    /** The message provided by the application when the log is recorded. */
    'message': string;
    /** A UUID identifying the tenant associated with the log entry. */
    'tenantId'?: string & tags.Format<'uuid'>;
}

/**
 * Represents a log entry that extends the standard Error object.
 * Includes additional metadata such as log level, creation date, correlation ID, and user ID.
 */
export interface OperationalLog extends Log {
    /** Any additional context associated with the log entry. Objects can be used but must be serialized first. */
    'additionalContext'?: string | number | Date;
    /** The severity or type of the log entry. */
    'level': LogLevel;
    /** The stack trace of the error, if applicable. */
    'stack'?: string;
}

/**
 * Represents an audit log entry that extends the standard Log object.
 * Includes metadata about changes made to objects, including before and after states,
 * along with categorization information.
 */
export interface AuditLog extends Log {
    /** The object being audited before being mutated. */
    'before': string | number | Date;
    /** The object being audited after being mutated. */
    'after': string | number | Date;
    /** The category of the audit. */
    'category': string;
}

/**
 * Represents the parameters that can be used when creating an operational log entry.
 * Allows partial specification of operational log properties.
 */
export type OperationalLogParameters = Pick<OperationalLog, 'level' | 'message' | 'stack' | 'additionalContext'>;

/**
 * Represents the parameters that can be used when creating an audit log entry.
 * Allows partial specification of audit log properties.
 */
export type AuditLogParameters = Pick<AuditLog, 'message' | 'category' | 'before' | 'after'>;

/**
 * Represents the severity level of a log message.
 *
 * Supported log levels include:
 * - 'Critical': Severe error events that will presumably lead the application to abort.
 * - 'Error': Error events that might still allow the application to continue running.
 * - 'Warning': Potentially harmful situations.
 * - 'Information': Informational messages that highlight the progress of the application.
 * - 'Trace': Finer-grained informational events than the Debug level.
 * - 'Debug': Detailed information, typically of interest only when diagnosing problems.
 */
export enum LogLevel {
    'Critical' = 6,
    'Error' = 5,
    'Warning' = 4,
    'Information' = 3,
    'Debug' = 2,
    'Trace' = 1
}

/**
 * Represents the name of a log level.
 * Excludes numeric keys from the LogLevel enum.
 */
export type LogLevelName = Exclude<keyof typeof LogLevel, number>;

export type { LogEngineHostConfiguration, LogRequestMetadata };
