# LogEngine

LogEngine is a Node.js logging library with a singleton log engine and pluggable destinations. It records operational logs and audit logs, then enriches every entry with request metadata supplied by the host application.

## Install

```bash
npm install @software-hardware-integration-lab/log-engine
```

## Initialize the engine

Configure the host before obtaining the singleton or adding plugins. The `getRequestMetadata` callback is evaluated for every log entry. It should return the identifiers associated with the current operation; when it returns `undefined`, LogEngine uses all-zero UUID placeholders for correlationId/requestId/userId.

```typescript
import {
	ConsoleDestination,
	LogEngine,
	LogLevel,
	type LogRequestMetadata
} from '@software-hardware-integration-lab/log-engine';

const defaultRequestMetadata: LogRequestMetadata = {
	'correlationId': '00000000-0000-0000-0000-000000000000' as LogRequestMetadata['correlationId'],
	'userId': 'background-worker'
};

LogEngine.configureHost({
	'getRequestMetadata': () => defaultRequestMetadata
});

const logEngine = LogEngine.getInstance();

await logEngine.addPlugin(ConsoleDestination);

logEngine.log({
	'level': LogLevel.Information,
	'message': 'Worker started.'
});

logEngine.auditLog({
	'after': 'enabled',
	'before': 'disabled',
	'category': 'FeatureFlag',
	'message': 'Enabled the new worker.'
});
```

`log` accepts a level, message, optional stack trace, and optional primitive `additionalContext`. `auditLog` records a category plus the required `before` and `after` values. Log submission is asynchronous and does not block the caller.

## Request context in web servers

For web servers, return metadata from an async-local request context. This keeps correlation, user, tenant, and optional request IDs associated with the correct request even after asynchronous work begins.

This follows a common pattern: middleware creates a correlation ID, resolves the authenticated user when available, sets `X-CORRELATION-ID`, and invokes the remaining middleware inside `AsyncLocalStorage`.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
	LogEngine,
	type LogRequestMetadata
} from '@software-hardware-integration-lab/log-engine';

const app = express();
const requestLogContext = new AsyncLocalStorage<LogRequestMetadata>();

LogEngine.configureHost({
	'getRequestMetadata': () => requestLogContext.getStore()
});

function createRequestLogContext(request: Request): LogRequestMetadata {
	return {
		'correlationId': crypto.randomUUID() as LogRequestMetadata['correlationId'],
		// Resolve this from your authentication layer. A stable anonymous value is valid.
		'userId': request.header('X-USER-ID') ?? 'anonymous'
	};
}

function isolatedLoggingState(request: Request, response: Response, next: NextFunction): void {
	const requestMetadata = createRequestLogContext(request);

	response.setHeader('X-CORRELATION-ID', requestMetadata.correlationId);
	requestLogContext.run(requestMetadata, next);
}

app.use(isolatedLoggingState);
```

Register this middleware before handlers that log. Add `requestId` and `tenantId` to the context when your application has them; both must be UUIDs. SHIELD reads its `AsyncLocalStorage` state from its `getRequestMetadata` host adapter, so each log emitted during a request automatically contains its correlation ID, authenticated user, and tenant ID.

## Destinations

Call `addPlugin` once for each destination during application startup. A destination with the same ID is only registered once. All destinations accept the optional `getShouldWriteOperationalLogs`, `getShouldWriteAuditLogs`, and `getShouldWriteDebugInfo` callbacks, which are evaluated when the destination processes a log. Use them for runtime switches without rebuilding the engine.

### ConsoleDestination

`ConsoleDestination` writes operational and audit logs to the process console. By default, critical and error logs use `console.error`, warnings use `console.warn`, and the remaining operational levels plus audit logs use `console.log`.

```typescript
import {
	ConsoleDestination,
	LogEngine,
	LogLevel
} from '@software-hardware-integration-lab/log-engine';

const logEngine = LogEngine.getInstance();

await logEngine.addPlugin(ConsoleDestination, {
	'getShouldWriteOperationalLogs': () => process.env.NODE_ENV !== 'test',
	'logLevelToConsoleMethod': {
		[LogLevel.Information]: 'log',
		[LogLevel.Warning]: 'warn',
		[LogLevel.Error]: 'error'
	}
});
```

### FileDestination

`FileDestination` writes separate operational (`OP_`) and audit (`AUDIT_`) files. It creates the output directory, rotates files on the configured interval, and starts expired-file cleanup when it is added. `formattedLog` is the default format; add `json` to write structured JSON alongside it.

```typescript
import {
	FileDestination,
	LogEngine
} from '@software-hardware-integration-lab/log-engine';

const logEngine = LogEngine.getInstance();

await logEngine.addPlugin(FileDestination, {
	'getShouldWriteAuditLogs': () => true,
	'getShouldWriteOperationalLogs': () => true,
	'logRetentionAgeMinutes': 60 * 24 * 7,
	'outputDirectory': './logs',
	'outputFormats': ['formattedLog', 'json'],
	'rotationIntervalMinutes': 60
});
```

The default directory is `./logs/dev`, the default rotation interval is 60 minutes, and the default retention period is one day. SHIELD conditionally adds this destination in debug mode, using the runtime write callbacks to control it.

### LogAnalyticsDestination

`LogAnalyticsDestination` sends operational and audit logs through host-provided structural uploaders. The package intentionally does not depend on an Azure SDK: the host owns credentials and SDK clients, while the destination only needs an object with `upload(ruleId, streamName, logs)`.

The following example adapts Azure Monitor's `LogsIngestionClient`. Install the Azure packages in the host application, not LogEngine:

```bash
npm install @azure/identity @azure/monitor-ingestion
```

```typescript
import { DefaultAzureCredential } from '@azure/identity';
import { LogsIngestionClient } from '@azure/monitor-ingestion';
import {
	LogAnalyticsDestination,
	LogEngine,
	type LogAnalyticsUploader
} from '@software-hardware-integration-lab/log-engine';

const credential = new DefaultAzureCredential();
const auditClient = new LogsIngestionClient('https://audit.example.ingest.monitor.azure.com', credential);
const operationalClient = new LogsIngestionClient('https://operational.example.ingest.monitor.azure.com', credential);

function createUploader(client: LogsIngestionClient): LogAnalyticsUploader {
	return {
		async upload(ruleId, streamName, logs): Promise<void> {
			await client.upload(ruleId, streamName, logs);
		}
	};
}

const logEngine = LogEngine.getInstance();

await logEngine.addPlugin(LogAnalyticsDestination, {
	'audit': {
		'streamName': 'Custom-Audit_CL',
		'uploader': createUploader(auditClient)
	},
	'operational': {
		'streamName': 'Custom-Operational_CL',
		'uploader': createUploader(operationalClient)
	},
	'ruleId': 'your-data-collection-rule-immutable-id'
});
```

The configured streams must accept the destination payloads: audit records include `After`, `Before`, `Category`, `CorrelationId`, `Message`, `ShieldTenantId`, `TimeGenerated`, and `UserId`; operational records include `AdditionalContext`, `CorrelationId`, `Level`, `Message`, `ShieldTenantId`, `Stack`, `TimeGenerated`, and `UserId`.

For settings that can change at runtime, provide `getRuleId`, `getIngestionEndpoint`, `getStreamName`, and an `uploaderFactory` instead of static values. This is the approach used by SHIELD's Log Analytics host adapter: it keeps Azure credentials, clients, and mutable settings in application code while supplying the destination a small uploader contract.

