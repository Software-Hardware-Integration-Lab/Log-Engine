import { type AuditLog, type AuditLogParameters, type LogEngineHostConfiguration, type LogRequestMetadata, type OperationalLog, type OperationalLogParameters } from '#/interfaces/LogEngine.js';
import type { LoggingPluginContract, LoggingPluginCreateOptions, LoggingPluginFactory, LoggingPluginOptionsMode } from '#/interfaces/plugins/LoggingPlugin.js';
import { assertGuardEquals } from 'typia';
import { UUID_EMPTY } from './helpers/Constants.js';

/** Runtime shape used to inspect the optional create member on a plugin factory input. */
interface LoggingPluginFactoryInput {
    /** Create member inspected by the custom runtime validation path. */
    'create': unknown;
}

/**
 * Manages logging operations with support for multiple plugins.
 * Provides singleton instance management and handles both operational and audit logging.
 */
export class LogEngine {
    /** Single global instance of the {@link LogEngine}. Should only be undefined when {@link getInstance} has never been called. */
    static #instance: LogEngine | undefined = void 0;

    /** Host-specific runtime hooks consumed by the package-local LogEngine surface. */
    static #hostConfiguration: LogEngineHostConfiguration = {
        'getRequestMetadata': void 0,
        'shouldAllowReset': void 0
    };

    /** The static list of all registered logging plugins. */
    readonly #pluginList: LoggingPluginContract[];

    /**
     * Initializes a new instance of the LogEngine class.
     * Sets up the isolated request engine and performs cistern initialization.
     * This constructor is private to enforce the singleton pattern.
     */
    private constructor() {
        this.#pluginList = [];
    }

    /**
     * Returns the singleton instance of the {@link LogEngine} class.
     * If the instance does not exist, it will be created.
     * @returns The singleton instance of the LogEngine.
     */
    public static getInstance(): LogEngine {
        // Check if class instance has not been created and instantiate it
        if (typeof this.#instance === 'undefined') { this.#instance = new LogEngine(); }

        // Return the working reference to the caller
        return this.#instance;
    }

    /**
     * Configures the host-specific dependencies consumed by LogEngine.
     * @param configuration Host-specific getters and guards used by LogEngine.
     */
    public static configureHost(configuration: LogEngineHostConfiguration): void {
        /** Runtime copy used to validate incoming host configuration values. */
        const configurationInput: unknown = configuration;

        if (typeof configurationInput !== 'object' || configurationInput === null) {
            throw new TypeError('The LogEngine host configuration must be an object.', { 'cause': 'Input Validation' });
        }

        if (
            Object.hasOwn(configurationInput, 'getRequestMetadata') &&
            typeof configuration.getRequestMetadata !== 'function'
        ) {
            throw new TypeError('The LogEngine host configuration getRequestMetadata member must be a function when provided.', { 'cause': 'Input Validation' });
        }

        if (
            Object.hasOwn(configurationInput, 'shouldAllowReset') &&
            typeof configuration.shouldAllowReset !== 'function'
        ) {
            throw new TypeError('The LogEngine host configuration shouldAllowReset member must be a function when provided.', { 'cause': 'Input Validation' });
        }

        this.#hostConfiguration = {
            'getRequestMetadata': configuration.getRequestMetadata,
            'shouldAllowReset': configuration.shouldAllowReset
        };
    }

    /**
     * Reset instance so it can be re-initialized. Use scenario TBD.
     * @deprecated This is only for use in tests, not for live code.
     * Using outside of Dev env will also throw an error.
     */
    public static reset(): void {
        /** Reset guard supplied by the host application. */
        const { shouldAllowReset } = this.#hostConfiguration;

        if (typeof shouldAllowReset !== 'function' || !shouldAllowReset()) {
            throw new Error('This function is called outside of a test and/or without host authorization.', { 'cause': 'Invalid use of function call' });
        }

        if (this.#instance) {
            for (const plugin of this.#instance.#pluginList) {
                plugin.dispose();
            }
        }

        // Reset the instance to be re-instantiated on the next access request
        this.#instance = void 0;
    }

    /**
     * Adds a logging plugin to the engine with the specified options.
     * @param pluginFactory - The factory function to create the plugin instance.
     * @param options - The single explicit options object used to configure the plugin.
     * @returns A promise that resolves when the plugin has been added.
     */
    public async addPlugin<
        TPlugin extends LoggingPluginContract
    >(
        pluginFactory: LoggingPluginFactory<TPlugin>
    ): Promise<void>;
    /**
     * Adds a logging plugin whose explicit options object is optional.
     * @param pluginFactory The factory function used to create the plugin instance.
     * @param options The optional explicit options object used to configure the plugin.
     * @returns A promise that resolves when the plugin has been added.
     */
    public async addPlugin<
        TPlugin extends LoggingPluginContract,
        TOptions
    >(
        pluginFactory: LoggingPluginFactory<TPlugin, TOptions, 'optional'>,
        options?: TOptions
    ): Promise<void>;
    /**
     * Adds a logging plugin whose explicit options object is required.
     * @param pluginFactory The factory function used to create the plugin instance.
     * @param options The explicit options object used to configure the plugin.
     * @returns A promise that resolves when the plugin has been added.
     */
    public async addPlugin<
        TPlugin extends LoggingPluginContract,
        TOptions
    >(
        pluginFactory: LoggingPluginFactory<TPlugin, TOptions, 'required'>,
        options: TOptions
    ): Promise<void>;
    /**
     * Adds a logging plugin to the engine using one explicit options object.
     * @param pluginFactory The factory function used to create the plugin instance.
     * @param options The explicit options object used to configure the plugin.
     * @returns A promise that resolves when the plugin has been added.
     */
    public async addPlugin<
        TPlugin extends LoggingPluginContract,
        TOptions = undefined,
        TMode extends LoggingPluginOptionsMode = 'none'
    >(
        pluginFactory: LoggingPluginFactory<TPlugin, TOptions, TMode>,
        options?: TOptions
    ): Promise<void> {
        // #region Input Validation
        /** Runtime copy used to validate incoming factory values that may be classes. */
        const pluginFactoryInput: unknown = pluginFactory;

        if ((typeof pluginFactoryInput !== 'object' && typeof pluginFactoryInput !== 'function') || pluginFactoryInput === null) {
            throw new TypeError('The plugin factory parameter must be an object or function with a create method!', { 'cause': 'Input Validation' });
        }

        if (!Object.hasOwn(pluginFactoryInput, 'create') || typeof (pluginFactoryInput as LoggingPluginFactoryInput).create !== 'function') {
            throw new TypeError('The plugin factory parameter must expose a create function!', { 'cause': 'Input Validation' });
        }

        // #endregion Input Validation

        /** The created instance of the plugin. */
        const pluginInstance = await pluginFactory.create(options as LoggingPluginCreateOptions<TOptions, TMode>);

        // If the plugin instance is falsy, do not attempt to add it to the plugin list.
        if (!pluginInstance) {
            LogEngine.#reportInternalError(`Plugin factory ${ pluginFactory.create.name } returned a falsy value, so the plugin was not added.`);

            return;
        }

        // Only add the plugin to the list if it is not already present, using its unique ID for comparison.
        if (this.#pluginList.every((plugin) => plugin.id !== pluginInstance.id)) {
            // Add the plugin instance to the list of registered plugins for log processing.
            this.#pluginList.push(pluginInstance);
        } else {
            // If a plugin with the same ID is already registered, report an internal error and do not add the duplicate plugin.
            LogEngine.#reportInternalError(`Plugin with ID ${ pluginInstance.id } is already registered, so the plugin was not added.`);

            pluginInstance.dispose();
        }
    }

    /**
     * Logs a message with the specified log level, message, and optional stack trace.
     * The log entry is cached per user and correlation ID for later retrieval.
     * @param parameters An object containing the parameters for the log entry, including level, message, stack, and additionalContext.
     */
    public log(parameters: OperationalLogParameters): void {
        // #region input validation
        /* v8 ignore next */
        assertGuardEquals(parameters);
        // #endregion input validation

        /** The user metadata for the current request. */
        const requestMetadata = LogEngine.#getRequestMetadata();

        /** The log entry itself that will be cached and pushed to any plugins. */
        const logEntry: OperationalLog = {
            'additionalContext': parameters.additionalContext ?? void 0,
            'correlationId': requestMetadata.correlationId,
            'level': parameters.level,
            'message': parameters.message,
            'requestId': requestMetadata.requestId,
            'stack': parameters.stack,
            'tenantId': requestMetadata.tenantId,
            'timeGenerated': new Date(),
            'userId': requestMetadata.userId
        };

        // Push the log entry to the immediate plugins - may be problematic during full application crash.
        void this.#runLogPlugins(logEntry).catch((error: unknown) => {
            LogEngine.#reportInternalError(`Operational logging plugin failed: ${ error instanceof Error ? error.message : String(error) }`);
        });
    }

    /**
     * Logs an audit message with the specified parameters.
     * The audit log entry is pushed to any registered plugins for processing.
     * @param parameters - An object containing the parameters for the audit log entry, including before, after, category, and message.
     */
    public auditLog(parameters: AuditLogParameters): void {
        // #region input validation
        /* v8 ignore next */
        assertGuardEquals(parameters);
        // #endregion input validation

        /** The user metadata for the current request. */
        const requestMetadata = LogEngine.#getRequestMetadata();

        /** The audit log entry itself that will be pushed to any plugins. */
        const logEntry: AuditLog = {
            'after': parameters.after,
            'before': parameters.before,
            'category': parameters.category,
            'correlationId': requestMetadata.correlationId,
            'message': parameters.message,
            'requestId': requestMetadata.requestId,
            'tenantId': requestMetadata.tenantId,
            'timeGenerated': new Date(),
            'userId': requestMetadata.userId
        };

        // Push the audit log entry to the immediate plugins - may be problematic during full application crash.
        void this.#runAuditLogPlugins(logEntry).catch((error: unknown) => {
            LogEngine.#reportInternalError(`Audit logging plugin failed: ${ error instanceof Error ? error.message : String(error) }`);
        });
    }

    /**
     * Gets the IDs of all registered plugins.
     * @returns An array of plugin IDs.
     */
    public getPluginIds(): string[] {
        return this.#pluginList.map((plugin) => plugin.id);
    }

    /**
     * Removes a plugin from the plugin list by its ID.
     * @param pluginId - The ID of the plugin to remove.
     * @returns True if the plugin was successfully removed, false if not found.
     */
    public removePlugin(pluginId: string): boolean {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(pluginId);
        // #endregion Input validation

        /** The index of the plugin to remove, or -1 if not found. */
        const pluginIndex = this.#pluginList.findIndex((plugin) => plugin.id === pluginId);

        // If the plugin is not found return false.
        if (pluginIndex === -1) {
            return false;
        }

        /** The plugin being removed from the engine. */
        const [plugin] = this.#pluginList.splice(pluginIndex, 1);

        plugin?.dispose();

        return true;
    }

    /**
     * Asynchronously processes a log entry by passing it to all log plugins immediately.
     *
     * This method asserts the validity of the provided log entry and then iterates
     * through the list of immediate log plugins, awaiting each plugin's handling
     * of the log entry.
     * @param logEntry - The log entry to be processed by the immediate plugins.
     * @returns A promise that resolves when all plugins have processed the log entry.
     */
    async #runLogPlugins(logEntry: OperationalLog): Promise<void> {
        /** Point in time snapshot of the current enabled plugins to avoid race conditions. */
        const pluginsSnapshot = [...this.#pluginList];

        /*
         * Dispatch to all plugins concurrently; await the batch so callers know every
         * plugin has settled before this resolves.
         */
        await Promise.all(pluginsSnapshot.map((plugin) => LogEngine
            .#logErrorHandle(plugin.id, () => plugin.log(logEntry))));
    }

    /**
     * Asynchronously processes an audit log entry by passing it to all registered plugins.
     *
     * This method iterates through the list of plugins, awaiting each plugin's handling
     * of the audit log entry.
     * @param logEntry - The audit log entry to be processed by the plugins.
     * @returns A promise that resolves when all plugins have processed the audit log entry.
     */
    async #runAuditLogPlugins(logEntry: AuditLog): Promise<void> {
        /** Point in time snapshot of the current enabled plugins to avoid race conditions. */
        const pluginsSnapshot = [...this.#pluginList];

        /*
         * Dispatch to all plugins concurrently; await the batch so callers know every
         *  plugin has settled before this resolves.
         */
        await Promise.all(pluginsSnapshot.map((plugin) => LogEngine
            .#logErrorHandle(plugin.id, () => plugin.auditLog(logEntry))));
    }

    /**
     * Executes a plugin logging operation and reports any failure without
     * interrupting delivery to remaining plugins.
     * @param logFunction The asynchronous plugin logging operation to execute.
     * @returns A promise that resolves after the operation completes or its failure is reported.
     */
    static async #logErrorHandle(logFunction: () => Promise<void>): Promise<void> {
        try {
            await logFunction();
        } catch (error: unknown) {
            LogEngine.#reportInternalError(`Logging plugin failed: ${ error instanceof Error ? error.message : String(error) }`);
        }
    }

    /**
     * Retrieves data which can be used to identify the user, tenant and request pipeline.
     * @returns A `LogRequestMetadata` object containing metadata.
     */
    static #getRequestMetadata(): LogRequestMetadata {
        /** Request metadata returned by the injected host getter. */
        const requestMetadata = LogEngine.#hostConfiguration.getRequestMetadata?.();

        if (typeof requestMetadata === 'undefined') {
            return LogEngine.#getNullRequestMetadata();
        }

        /* v8 ignore next */
        assertGuardEquals(requestMetadata);

        return requestMetadata;
    }

    /**
     * Reports an internal error message to the console.
     * This method is used for logging errors that occur within the LogEngine itself,
     * such as plugin creation failures or duplicate plugin registrations.
     * It is intentionally kept separate from the writeDebugInfo method to
     * maintain proper separation of concerns and to ensure that internal errors are always reported,
     * even if debug logging is disabled.
     * @param message - The error message to report.
     */
    static #reportInternalError(message: string): void {
        // #region Input validation
        /* v8 ignore next */
        assertGuardEquals(message);
        // #endregion Input validation

        // Log the internal error message to the console with a clear prefix for identification.
        // eslint-disable-next-line no-console
        console.error(`[LogEngine Internal Error]: ${ message }`);
    }

    /**
     * Returns null-equivalent request metadata when the host does not provide any runtime data.
     * @returns Null-equivalent request metadata.
     */
    static #getNullRequestMetadata(): LogRequestMetadata {
        // Use all-zero UUIDs intentionally so the null-object metadata still satisfies the package-local UUID contract.
        return {
            'correlationId': UUID_EMPTY,
            'requestId': UUID_EMPTY,
            'userId': UUID_EMPTY
        };
    }
}
