import type { tags } from 'typia';

/** Package-local metadata used to identify the current logging request context. */
export interface LogRequestMetadata {
    /** Correlation identifier shared across related log entries. */
    'correlationId': string & tags.Format<'uuid'>;

    /** Optional request identifier supplied by the host application. */
    'requestId'?: string & tags.Format<'uuid'>;

    /** Optional tenant identifier supplied by the host application. */
    'tenantId'?: string & tags.Format<'uuid'>;

    /** User identifier resolved by the host application. */
    'userId': string;
}
