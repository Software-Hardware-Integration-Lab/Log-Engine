import { DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS, type LoggingPluginConfigurationOptions } from './LoggingPlugin.js';
import type { tags } from 'typia';

/** Configuration options for Azure Storage append-blob logging behavior. */
export interface AzureStorageDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Maximum number of UTF-8 bytes permitted in one append-blob write. */
    'maxAppendBlockBytes'?: number & tags.Minimum<1>;
}

/** Fully resolved options used internally by the Azure Storage destination. */
export interface ResolvedAzureStorageDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Maximum number of UTF-8 bytes permitted in one append-blob write. */
    'maxAppendBlockBytes': number & tags.Minimum<1>;
}

/** Static default options for Azure Storage append-blob logging. */
export const DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS: ResolvedAzureStorageDestinationOptions = {
    ...DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS,
    // The stable limit supported by all Append Blob service API versions.
    'maxAppendBlockBytes': 4 * 1024 * 1024
};
