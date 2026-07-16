import { stat } from 'node:fs/promises';

/**
 * Checks if the specified file exists.
 * @param filepath The filepath to check for existence.
 * @returns True when the file exists; otherwise false.
 */
export async function doesFileExist(filepath: string): Promise<boolean> {
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
