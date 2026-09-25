import { DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS, type LoggingPluginConfigurationOptions } from './LoggingPlugin.js';
import type { tags } from 'typia';

/**
 * Minimal contract for an Azure Blob append-blob client. Structurally compatible with
 * `@azure/storage-blob`'s `AppendBlobClient`, so real SDK instances satisfy this type without
 * requiring `@azure/storage-blob` to resolve the public declarations of this package.
 */
export interface AzureAppendBlobClientLike {
    /** Appends a block of content to the append blob. */
    'appendBlock': (content: string, contentLength: number) => Promise<{ 'blobCommittedBlockCount'?: number; }>;
    /** Creates the append blob if it does not already exist; `succeeded` is false when it already existed. */
    'createIfNotExists': () => Promise<{
        'errorCode'?: string;
        'succeeded'?: boolean;
    }>;
    /** Reads current blob properties, used to recover the true committed block count of a reopened blob. */
    'getProperties': () => Promise<{ 'blobCommittedBlockCount'?: number; }>;
}

/**
 * Minimal contract for an Azure Blob container client. Structurally compatible with
 * `@azure/storage-blob`'s `ContainerClient`, so real SDK instances satisfy this type without
 * requiring `@azure/storage-blob` to resolve the public declarations of this package.
 */
export interface AzureBlobContainerLike {
    /** Creates the container if it does not already exist. */
    'createIfNotExists': () => Promise<unknown>;
    /** Gets a client for the named append blob within this container. */
    'getAppendBlobClient': (blobName: string) => AzureAppendBlobClientLike;
}

/** Configuration options for Azure Storage append-blob logging behavior. */
export interface AzureStorageDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Maximum number of UTF-8 bytes permitted in one append-blob write. */
    'maxAppendBlockBytes'?: number & tags.Minimum<1>;
    /** Maximum number of blocks written to a single append blob before rotating to a suffixed blob. */
    'maxBlocksPerBlob'?: number & tags.Minimum<1> & tags.Maximum<50_000>;
    /** The minutes duration that a log file will be written to before creating a new log file. */
    'rotationIntervalMinutes'?: number & tags.Minimum<1> & tags.Maximum<1_440>;
}

/** Fully resolved options used internally by the Azure Storage destination. */
export interface ResolvedAzureStorageDestinationOptions extends LoggingPluginConfigurationOptions {
    /** Maximum number of UTF-8 bytes permitted in one append-blob write. */
    'maxAppendBlockBytes': number & tags.Minimum<1>;
    /** Maximum number of blocks written to a single append blob before rotating to a suffixed blob. */
    'maxBlocksPerBlob': number & tags.Minimum<1> & tags.Maximum<50_000>;
    /** The minutes duration that a log file will be written to before creating a new log file. */
    'rotationIntervalMinutes': number & tags.Minimum<1> & tags.Maximum<1_440>;
}

/** Static default options for Azure Storage append-blob logging. */
export const DEFAULT_AZURE_STORAGE_DESTINATION_OPTIONS: ResolvedAzureStorageDestinationOptions = {
    ...DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS,
    // The stable limit supported by all Append Blob service API versions.
    'maxAppendBlockBytes': 4 * 1024 * 1024,
    // Azure's hard append-blob limit; rotating at this point uses the full available capacity.
    'maxBlocksPerBlob': 50_000,
    // Default to an hourly log file.
    'rotationIntervalMinutes': 60
};
