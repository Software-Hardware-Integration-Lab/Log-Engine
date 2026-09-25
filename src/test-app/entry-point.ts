/* eslint-disable no-console */
import { AzureStorageDestination, ConsoleDestination, Logger } from '#/index.js';
import { LogEngine } from '#/LogEngine.js';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { setTimeout as delay } from 'node:timers/promises';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

interface TestResult {
    'totalErrors': number;
    'totalIterations': number;
}

type PluginSetup = () => Promise<void>;

interface MemorySnapshot {
    'timestampMs': number;
    'rssMb': number;
    'heapUsedMb': number;
    'heapTotalMb': number;
    'heapGrowth': number;
}

const snapshots: MemorySnapshot[] = [];

const eventLoopMonitor = monitorEventLoopDelay({
    'resolution': 10
});

let startTime = 0;

async function testPlugins(durationMs: number, pluginSetups: PluginSetup[]): Promise<TestResult> {
    const result: TestResult = {
        'totalErrors': 0,
        'totalIterations': 0
    };

    await Promise.all(pluginSetups.map((factory) => factory()));

    eventLoopMonitor.enable();

    startTime = performance.now();

    const interval = setInterval(() => {
        try {
            // eslint-disable-next-line no-plusplus
            result.totalIterations++;

            Logger.info('logging');
        } catch (error: unknown) {
            console.error('BAD THING HAPPENED', error);

            // eslint-disable-next-line no-plusplus
            result.totalErrors++;
        }
    }, 10);

    const metricsInterval = setInterval(() => {
        const memory = process.memoryUsage();

        const startHeap = snapshots[0]?.heapUsedMb;

        const endHeap = snapshots.at(-1)?.heapUsedMb;

        const snapshot = {
            'timestampMs': performance.now(),
            'rssMb': memory.rss / 1024 / 1024,
            'heapUsedMb': memory.heapUsed / 1024 / 1024,
            'heapTotalMb': memory.heapTotal / 1024 / 1024,
            'heapGrowth': (endHeap ?? 0) - (startHeap ?? 0)
        };

        snapshots.push(snapshot);

        console.clear();

        console.table(snapshot);
    }, 10_000);

    Logger.info(`Starting plugin test for ${ durationMs }ms`);

    try {
        await delay(durationMs);
    } finally {
        clearInterval(interval);

        clearInterval(metricsInterval);

        eventLoopMonitor.disable();

        Logger.info('Plugin test complete');
    }

    return result;
}

async function setupBlobPlugin(): Promise<void> {
    console.log('Setting up blob');

    const engine = LogEngine.getInstance();

    const azuriteCredential = new StorageSharedKeyCredential('devstoreaccount1', 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==');

    const blobClient = new BlobServiceClient('http://localhost:10000/devstoreaccount1/', azuriteCredential);

    const containerClient = blobClient.getContainerClient('operational-logs-test');

    const blobFactory = AzureStorageDestination.create(
        containerClient,
        void 0,
        {
            'getShouldWriteAuditLogs': () => false,
            'getShouldWriteDebugInfo': () => true,
            'getShouldWriteOperationalLogs': () => true,
            'rotationIntervalMinutes': 2,
            'maxBlocksPerBlob': 5,
            'maxAppendBlockBytes': 300
        }
    );

    await engine.addPlugin({
        'create': () => blobFactory
    });

    console.log('Done setting up blob');
}

async function setupConsolePlugin(): Promise<void> {
    /** Configure console logging. */
    const consoleDestination = ConsoleDestination.create({
        'getShouldWriteAuditLogs': () => false,
        'getShouldWriteDebugInfo': () => true,
        'getShouldWriteOperationalLogs': () => true
    });

    await LogEngine.getInstance().addPlugin({
        'create': () => consoleDestination
    });
}

console.log('Starting tests');

const testDurationMs = (1 / 12) * 60 * 60 * 1000;

const result = await testPlugins(testDurationMs, [setupConsolePlugin, setupBlobPlugin]);

const elapsedMs = performance.now() - startTime;

const averageLogsPerSecond =
    result.totalIterations / (elapsedMs / 1000);

console.log('Complete');

console.log(`Total Iterations: ${ result.totalIterations }`);

console.log(`Total Errors: ${ result.totalErrors }`);

console.log(`Average logs per second: ${ averageLogsPerSecond }`);

console.log(`Mean event loop delay ms: ${ (eventLoopMonitor.mean / 1e6).toFixed(2) }`);

console.log(`p99 event loop delay ms: ${ (eventLoopMonitor.percentile(99) / 1e6).toFixed(2) }`);

console.log(`Max event loop delay ms: ${ (eventLoopMonitor.max / 1e6).toFixed(2) }`);

console.log(`peak heap user Mb ${ Math.max(...snapshots.map((snap) => snap.heapUsedMb)) }`);

console.log(`peak Rss Mb: ${ Math.max(...snapshots.map((snap) => snap.rssMb)) }`);

console.table(snapshots);
