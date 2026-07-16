import type { LogLevel, OperationalLog } from '#/interfaces/LogEngine.js';
import { assertGuardEquals } from 'typia';
import { LogSerializable } from './LogSerializable.js';
import { getLogLevelName } from '#/helpers/LogHelpers.js';
import type { LogSerializer, SerializedOperationalLog } from '#/interfaces/plugins/FileDestination.js';

/**
 * Serializable implementation of an operational log entry.
 */
export class SerializableOperationalLog extends LogSerializable implements OperationalLog, LogSerializer {
    /** Optional extra context attached to the log entry. */
    'additionalContext'?: string | number | Date;
    /** Operational severity level. */
    'level': LogLevel;
    /** Optional stack trace captured with the log entry. */
    'stack'?: string;

    /**
     * Additional context segment for text log output.
     * @returns Additional context segment.
     */
    get #additionalContextPart(): string {
        return LogSerializable.getStringFromMultiTypeLogProperty(this.additionalContext, ' ctx=');
    }

    /**
     * Stack trace segment for text log output.
     * @returns Stack trace segment.
     */
    get #stackPart(): string {
        return this.stack ? `\n${ this.stack }` : '';
    }

    /**
     * Severity segment for text log output.
     * @returns Severity segment.
     */
    get #levelPart(): string {
        return `[${ getLogLevelName(this.level) }]`;
    }

    /**
     * Creates a serializable operational log model.
     * @param operationalLog Source operational log entry.
     */
    constructor(operationalLog: OperationalLog) {
        super(operationalLog);

        assertGuardEquals(operationalLog);

        this.additionalContext = operationalLog.additionalContext;

        this.level = operationalLog.level;

        this.stack = operationalLog.stack;
    }

    /**
     * Builds the formatted plain-text representation of the operational entry.
     * @returns Formatted operational log string.
     */
    protected override toLogString(): string {
        /** Ordered text segments used to construct the final output. */
        const parts = [
            this.createdIso,
            this.#levelPart,
            this.correlationPart,
            this.tenantPart,
            this.userPart,
            this.message,
            this.#additionalContextPart,
            this.#stackPart
        ];

        return parts.filter((part) => part.length > 0).join(' ');
    }

    /**
     * Creates the structured representation used for JSON output.
     * @returns Serializable operational log object.
     */
    public override toSerializableLog(): SerializedOperationalLog {
        /** Base serializable structure produced by the shared parent implementation. */
        const base = super.toSerializableLog();

        return {
            ...base,
            'level': getLogLevelName(this.level),
            'stack': this.stack,
            'additionalContext': this.additionalContext
        };
    }
}
