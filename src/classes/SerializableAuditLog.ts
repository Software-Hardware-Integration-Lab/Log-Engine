import type { AuditLog } from '#/interfaces/LogEngine.js';
import { assertGuardEquals } from 'typia';
import { LogSerializable } from './LogSerializable.js';
import type { LogSerializer, SerializedAuditLog } from '#/interfaces/plugins/FileDestination.js';

/**
 * Serializable implementation of an audit log entry.
 */
export class SerializableAuditLog extends LogSerializable implements AuditLog, LogSerializer {
    /** Previous value captured by the audit operation. */
    before: string | number | Date;
    /** New value captured by the audit operation. */
    after: string | number | Date;
    /** Logical category for the audited action. */
    category: string;

    /**
     * Creates a serializable audit log model.
     * @param auditLog Source audit log entry.
     */
    constructor(auditLog: AuditLog) {
        /* v8 ignore next */
        assertGuardEquals(auditLog);

        super(auditLog);

        this.before = auditLog.before;

        this.after = auditLog.after;

        this.category = auditLog.category;
    }

    /**
     * Builds the formatted plain-text representation of the audit entry.
     * @returns Formatted audit log string.
     */
    protected override toLogString(): string {
        /** Formatted before-section text. */
        const before = LogSerializable.getStringFromMultiTypeLogProperty(this.before, '\nbefore:\n');

        /** Formatted after-section text. */
        const after = LogSerializable.getStringFromMultiTypeLogProperty(this.after, '\nafter:\n');

        /** Ordered text segments used to construct the final output. */
        const parts = [
            this.createdIso,
            `[AUDIT][${ this.category }]`,
            this.correlationPart,
            this.tenantPart,
            this.userPart,
            this.message,
            before,
            after
        ];

        return parts.filter((part) => part.length > 0).join(' ');
    }

    /**
     * Creates the structured representation used for JSON output.
     * @returns Serializable audit log object.
     */
    public override toSerializableLog(): SerializedAuditLog {
        /** Base serializable structure produced by the shared parent implementation. */
        const base = super.toSerializableLog();

        return {
            ...base,
            'after': this.after,
            'before': this.before,
            'category': this.category
        };
    }
}
