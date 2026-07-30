import { describe, expect, it } from 'vitest';
import { LogSerializable } from '#/classes/LogSerializable.js';
import { SerializableAuditLog } from '#/classes/SerializableAuditLog.js';
import { SerializableOperationalLog } from '#/classes/SerializableOperationalLog.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';

const uuid = '00000000-0000-0000-0000-000000000001';

const timestamp = new Date('2025-01-02T03:04:05.678Z');

function operationalLog(overrides: Partial<OperationalLog> = {}): OperationalLog {
    return {
        'additionalContext': void 0,
        'correlationId': uuid,
        'level': LogLevel.Information,
        'message': 'completed',
        'requestId': void 0,
        'stack': void 0,
        'tenantId': void 0,
        'timeGenerated': timestamp,
        'userId': 'user-1',
        ...overrides
    };
}

function auditLog(overrides: Partial<AuditLog> = {}): AuditLog {
    return {
        'after': 'new',
        'before': 'old',
        'category': 'Update',
        'correlationId': uuid,
        'message': 'changed',
        'requestId': void 0,
        'tenantId': void 0,
        'timeGenerated': timestamp,
        'userId': 'user-1',
        ...overrides
    };
}

class TestSerializableLog extends LogSerializable {
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    public property(value: string | number | Date | undefined, prefix?: string): string {
        return TestSerializableLog.getStringFromMultiTypeLogProperty(value, prefix);
    }

    protected toLogString(): string {
        return this.message;
    }
}

describe('LogSerializable', () => {
    it('should format strings, numbers, dates, and undefined multi-type properties', () => {
        const log = new TestSerializableLog(operationalLog());

        expect(log.property('text', 'x=')).toBe('x=text');

        expect(log.property(4, 'x=')).toBe('x=4');

        expect(log.property(timestamp, 'x=')).toBe('x=2025-01-02T03:04:05.678Z');

        expect(log.property(void 0, 'x=')).toBe('');
    });

    it('should serialize operational logs in formatted and JSON formats', () => {
        const log = new SerializableOperationalLog(operationalLog({
            'additionalContext': new Date('2025-01-01T00:00:00.000Z'),
            'level': LogLevel.Error,
            'stack': 'trace'
        }));

        expect(log.serialize('formattedLog')).toBe('2025-01-02T03:04:05.678Z [Error] cid=00000000-0000-0000-0000-000000000001 tid=undefined uid=user-1 completed  ctx=2025-01-01T00:00:00.000Z \ntrace');

        expect(JSON.parse(log.serialize('json'))).toMatchObject({
            'additionalContext': '2025-01-01T00:00:00.000Z',
            'level': 'Error',
            'stack': 'trace',
            'timeGenerated': '2025-01-02T03:04:05.678Z'
        });
    });

    it('should serialize audit logs and preserve before and after values', () => {
        const log = new SerializableAuditLog(auditLog({
            'after': 2,
            'before': new Date('2025-01-01T00:00:00.000Z')
        }));

        expect(log.serialize('formattedLog')).toContain('[AUDIT][Update]');

        expect(log.serialize('formattedLog')).toContain('before:\n2025-01-01T00:00:00.000Z');

        expect(JSON.parse(log.serialize('json'))).toMatchObject({
            'after': 2,
            'before': '2025-01-01T00:00:00.000Z',
            'category': 'Update'
        });
    });

    it('should reject unsupported serialization formats', () => {
        expect(() => new TestSerializableLog(operationalLog()).serialize('xml' as never)).toThrow('Unsupported log format');
    });
});
