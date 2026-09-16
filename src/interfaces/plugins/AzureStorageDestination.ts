import { DEFAULT_LOGGING_PLUGIN_CONFIGURATION_OPTIONS, type LoggingPluginConfigurationOptions } from './LoggingPlugin.js';
import type { tags } from 'typia';

/**
 * Minimal contract for an Azure Blob append-blob client. Structurally compatible with
 * `@azure/storage-blob`'s `AppendBlobClient`, so real SDK instances satisfy this type without
 * requiring `@azure/storage-blob` to resolve the public declarations of this package.
 */
export interface AzureAppendBlobClientLike {
    /** Appends a block of content to the append blob. */
    'appendBlock': (content: string, contentLength: number) => Promise<unknown>;
    /** Creates the append blob if it does not already exist. */
    'createIfNotExists': () => Promise<{ 'errorCode'?: string; }>;
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
