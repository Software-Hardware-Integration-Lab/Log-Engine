import type { Log } from '#/interfaces/LogEngine.js';
import type { FileLogFormat, SerializedLog } from '#/interfaces/plugins/FileDestination.js';
import { assertGuardEquals, type tags } from 'typia';

/**
 * Base serializable log model used by file destination serializers.
 */
export abstract class LogSerializable implements Log {
    /** Request ID associated with this log entry. */
    public requestId?: string & tags.Format<'uuid'>;
    /** Correlation ID used to link related entries. */
    public correlationId: string & tags.Format<'uuid'>;
    /** Timestamp when the log was generated. */
    public timeGenerated: Date;
    /** User identifier associated with the log entry. */
    public userId: string;
    /** Human-readable log message. */
    public message: string;
    /** Tenant ID associated with this log entry. */
    public tenantId?: string & tags.Format<'uuid'>;

    /** Preformatted ISO timestamp used in serialized output. */
    protected createdIso: string;

    /**
     * Formatted tenant segment for text log output.
     * @returns Tenant segment string.
     */
    protected get tenantPart(): string {
        return this.tenantId ? `tid=${ this.tenantId }` : 'tid=undefined';
    }

    /**
     * Formatted user segment for text log output.
     * @returns User segment string.
     */
    protected get userPart(): string {
        return this.userId ? `uid=${ this.userId }` : 'uid=undefined';
    }

    /**
     * Formatted correlation segment for text log output.
     * @returns Correlation segment string.
     */
    protected get correlationPart(): string {
        return this.correlationId ? `cid=${ this.correlationId }` : 'cid=undefined';
    }

    /**
     * Initializes common serializable log fields.
     * @param log Source log model.
     */
    public constructor(log: Log) {
        this.requestId = log.requestId;

        this.correlationId = log.correlationId;

        this.timeGenerated = log.timeGenerated;

        this.userId = log.userId;

        this.message = log.message;

        this.tenantId = log.tenantId;

        this.createdIso = log.timeGenerated instanceof Date ? log.timeGenerated.toISOString() : String(log.timeGenerated);
    }

    /**
     * Serializes this log using the requested file output format.
     * @param format Output format for serialization.
     * @returns Serialized log string.
     */
    public serialize(format: FileLogFormat): string {
        switch (format) {
            case 'json':
                return JSON.stringify(this.toSerializableLog());
            case 'formattedLog':
                return this.toLogString();
            default:
                throw new Error(`Unsupported log format: ${ String(format) }`);
        }
    }

    /**
     * Creates the formatted plain-text representation for this log type.
     * @returns Formatted log line.
     */
    protected abstract toLogString(): string;

    /**
     * Creates the shared structured object used by JSON serialization.
     * @returns Base serializable log object.
     */
    protected toSerializableLog(): SerializedLog {
        /** Base structured log object with normalized timestamp representation. */
        return {
            // I explicitly want to remove the class instance prototype here
            // eslint-disable-next-line @typescript-eslint/no-misused-spread
            ...this,
            'timeGenerated': this.createdIso
        } satisfies SerializedLog;
    }

    /**
     * Converts a multi-type log property to a formatted string.
     * @param property - The property value to convert (string, number, Date, or undefined).
     * @param prefix - Optional prefix to prepend to the result.
     * @returns The formatted string representation of the property.
     */
    protected static getStringFromMultiTypeLogProperty(property: string | number | Date | undefined, prefix = ''): string {
        // #region Input validation
        assertGuardEquals(property);
        // #endregion Input validation

        /** The resulting string after converting the property to a string with the appropriate formatting and prefix. */
        let result = prefix;

        switch (true) {
            /*
             * Numbers and strings don't need special serialization, but Dates should be
             * converted to ISO strings for readability.
             * Undefined or missing additionalContext will simply be omitted from the log.
             */
            case typeof property === 'string':
                // Assume strings can be logged directly without serialization.
                result += property;

                break;
            case typeof property === 'number':
                // Assume numbers can be logged directly without serialization.
                result += String(property);

                break;
            case property instanceof Date:
                // Format dates to ISO strings for readability.
                result += property.toISOString();

                break;
            case typeof property === 'undefined':
            default:
                // If the property is undefined, return an empty string regardless of the prefix.
                result = '';

                break;
        }

        return result;
    }
}
