import type { tags } from 'typia';

/** A UUID that is all zeroes. */
export const UUID_EMPTY: string & tags.Format<'uuid'> = '00000000-0000-0000-0000-000000000000' as const;
