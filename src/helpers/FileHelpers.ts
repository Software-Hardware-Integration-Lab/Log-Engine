import { stat } from 'node:fs/promises';
import { assertGuardEquals } from 'typia';

/**
 * Checks if the specified file exists.
 * @param filepath The filepath to check for existence.
 * @returns True when the file exists; otherwise false.
 */
export async function doesFileExist(filepath: string): Promise<boolean> {
    // #region Input validation
    /* v8 ignore next */
    assertGuardEquals(filepath);
    // #endregion Input validation

    // Check if the specified file exists.
    try {
        // Check for an existing file by reading its stats.
        await stat(filepath);

        // The file exists.
        return true;
    } catch (error) {
        // If the error indicates that the file does not exist, treat it as a new file.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }

        // For any other errors, rethrow to be handled by the caller.
        throw error;
    }
}
