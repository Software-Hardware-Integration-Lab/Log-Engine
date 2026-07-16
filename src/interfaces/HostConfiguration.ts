import type { LogRequestMetadata } from './RequestMetadata.js';

/** Getter used to resolve request metadata from the host application at runtime. */
export type LogRequestMetadataGetter = () => LogRequestMetadata;

/** Guard used to authorize the LogEngine reset API from the host application. */
export type LogEngineResetAuthorizationGuard = () => boolean;

/** Host-specific runtime hooks consumed by the package-local LogEngine surface. */
export interface LogEngineHostConfiguration {
    /** Returns request metadata for the current host execution context. */
    'getRequestMetadata'?: LogRequestMetadataGetter;

    /** Allows the test-only reset API when the host explicitly opts in. */
    'shouldAllowReset'?: LogEngineResetAuthorizationGuard;
}
