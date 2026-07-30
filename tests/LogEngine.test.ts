import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogEngine } from '#/LogEngine.js';
import { LogLevel, type AuditLog, type OperationalLog } from '#/interfaces/LogEngine.js';
import type { LoggingPluginContract } from '#/interfaces/plugins/LoggingPlugin.js';
import { UUID_EMPTY } from '../src/helpers/Constants';

const uuid = '00000000-0000-0000-0000-000000000001';

function operationalParameters(): Pick<OperationalLog, 'additionalContext' | 'level' | 'message' | 'stack'> {
    return {
        'additionalContext': 7,
        'level': LogLevel.Warning,
        'message': 'warn',
        'stack': 'stack'
    };
}

function auditParameters(): Pick<AuditLog, 'after' | 'before' | 'category' | 'message'> {
    return {
        'after': 'new',
        'before': 'old',
        'category': 'Update',
        'message': 'changed'
    };
}

describe('LogEngine', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => void 0);

        LogEngine.configureHost({ 'shouldAllowReset': () => true });

        LogEngine.reset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create a singleton and reset it when the host authorizes reset', () => {
        const first = LogEngine.getInstance();

        expect(LogEngine.getInstance()).toBe(first);

        LogEngine.reset();

        expect(LogEngine.getInstance()).not.toBe(first);
    });

    it('should reject reset and malformed host configurations when their contract is invalid', () => {
        expect(() => LogEngine.configureHost(null as never)).toThrow('must be an object');

        expect(() => LogEngine.configureHost({ 'getRequestMetadata': 'invalid' } as never)).toThrow('must be a function');

        expect(() => LogEngine.configureHost({ 'shouldAllowReset': 'invalid' } as never)).toThrow('must be a function');

        LogEngine.configureHost({});

        expect(() => LogEngine.reset()).toThrow('without host authorization');
    });

    it('should add distinct plugins, pass options, and remove plugins by identifier', async () => {
        const engine = LogEngine.getInstance();

        const plugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'plugin-1',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        const factory = { 'create': vi.fn().mockResolvedValue(plugin) };

        await engine.addPlugin(factory);

        await engine.addPlugin({
            'create': vi.fn().mockResolvedValue({
                ...plugin,
                'id': 'plugin-2'
            })
        }, { 'enabled': true });

        expect(factory.create).toHaveBeenCalledWith(void 0);

        expect(engine.getPluginIds()).toEqual(['plugin-1', 'plugin-2']);

        expect(engine.removePlugin('plugin-1')).toBe(true);

        expect(plugin.dispose).toHaveBeenCalledOnce();

        expect(engine.removePlugin('missing')).toBe(false);

        expect(engine.getPluginIds()).toEqual(['plugin-2']);
    });

    it('should reject invalid factories and report falsy or duplicate factory results', async () => {
        const engine = LogEngine.getInstance();

        await expect(engine.addPlugin(null as never)).rejects.toThrow('object or function');

        await expect(engine.addPlugin({} as never)).rejects.toThrow('create function');

        // eslint-disable-next-line func-name-matching
        await engine.addPlugin({ 'create': function empty() { return Promise.resolve(null); } });

        const plugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'duplicate',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        const duplicatePlugin: LoggingPluginContract = {
            ...plugin,
            'dispose': vi.fn()
        };

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(plugin) });

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(duplicatePlugin) });

        expect(engine.getPluginIds()).toEqual(['duplicate']);

        expect(plugin.dispose).not.toHaveBeenCalled();

        expect(duplicatePlugin.dispose).toHaveBeenCalledOnce();

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('returned a falsy value'));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'));
    });

    it('should dispose every registered plugin when reset', async () => {
        const engine = LogEngine.getInstance();

        const firstPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'first',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        const secondPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'second',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(firstPlugin) });

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(secondPlugin) });

        LogEngine.reset();

        expect(firstPlugin.dispose).toHaveBeenCalledOnce();

        expect(secondPlugin.dispose).toHaveBeenCalledOnce();
    });

    it('should enrich logs with host metadata and dispatch operational and audit entries', async () => {
        const engine = LogEngine.getInstance();

        const plugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'receiver',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        LogEngine.configureHost({
            'getRequestMetadata': () => ({
                'correlationId': uuid,
                'requestId': uuid,
                'tenantId': uuid,
                'userId': 'host-user'
            }),
            'shouldAllowReset': () => true
        });

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(plugin) });

        engine.log(operationalParameters());

        engine.auditLog(auditParameters());

        await vi.waitFor(() => expect(plugin.log).toHaveBeenCalledOnce());

        expect(plugin.log).toHaveBeenCalledWith(expect.objectContaining({
            'requestId': uuid,
            'tenantId': uuid,
            'userId': 'host-user'
        }));

        expect(plugin.auditLog).toHaveBeenCalledWith(expect.objectContaining({
            'category': 'Update',
            'userId': 'host-user'
        }));
    });

    it('should use null metadata, reject invalid metadata, and report asynchronous plugin failures', async () => {
        const engine = LogEngine.getInstance();

        const failingPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockRejectedValue('audit failure'),
            'dispose': vi.fn(),
            'id': 'failure',
            'log': vi.fn().mockRejectedValue(new Error('log failure'))
        };

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(failingPlugin) });

        engine.log(operationalParameters());

        engine.auditLog(auditParameters());

        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));

        expect(failingPlugin.log).toHaveBeenCalledWith(expect.objectContaining({ 'correlationId': UUID_EMPTY }));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Logging plugin failed: log failure'));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Logging plugin failed: audit failure'));

        LogEngine.configureHost({
            'getRequestMetadata': () => ({ 'correlationId': uuid }) as never,
            'shouldAllowReset': () => true
        });

        expect(() => engine.log(operationalParameters())).toThrow();
    });

    it('should reject host metadata with malformed UUID identifiers', () => {
        const engine = LogEngine.getInstance();

        for (const invalidMetadata of [
            {
                'correlationId': 'invalid-correlation-id',
                'userId': 'host-user'
            },
            {
                'correlationId': uuid,
                'requestId': 'invalid-request-id',
                'userId': 'host-user'
            },
            {
                'correlationId': uuid,
                'tenantId': 'invalid-tenant-id',
                'userId': 'host-user'
            }
        ]) {
            LogEngine.configureHost({
                'getRequestMetadata': () => invalidMetadata as never,
                'shouldAllowReset': () => true
            });

            expect(() => engine.log(operationalParameters())).toThrow();
        }
    });

    it('should continue dispatching operational and audit logs after a plugin failure', async () => {
        const engine = LogEngine.getInstance();

        const failingPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockRejectedValue(new Error('audit failure')),
            'dispose': vi.fn(),
            'id': 'failing',
            'log': vi.fn().mockRejectedValue(new Error('operational failure'))
        };

        const succeedingPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'succeeding',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(failingPlugin) });

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(succeedingPlugin) });

        engine.log(operationalParameters());

        engine.auditLog(auditParameters());

        await vi.waitFor(() => {
            expect(succeedingPlugin.log).toHaveBeenCalledOnce();

            expect(succeedingPlugin.auditLog).toHaveBeenCalledOnce();
        });

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('operational failure'));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('audit failure'));
    });

    it('should deliver entries accepted before a plugin is removed to later plugins', async () => {
        const engine = LogEngine.getInstance();
        let releaseOperationalLog: (() => void) | undefined;
        let releaseAuditLog: (() => void) | undefined;
        const operationalLogStarted = new Promise<void>((resolve) => { releaseOperationalLog = resolve; });
        const auditLogStarted = new Promise<void>((resolve) => { releaseAuditLog = resolve; });
        const firstPlugin: LoggingPluginContract = {
            'auditLog': vi.fn(() => auditLogStarted),
            'dispose': vi.fn(),
            'id': 'first',
            'log': vi.fn(() => operationalLogStarted)
        };
        const secondPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockResolvedValue(void 0),
            'dispose': vi.fn(),
            'id': 'second',
            'log': vi.fn().mockResolvedValue(void 0)
        };

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(firstPlugin) });

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(secondPlugin) });

        engine.log(operationalParameters());

        await vi.waitFor(() => expect(firstPlugin.log).toHaveBeenCalledOnce());

        expect(engine.removePlugin('first')).toBe(true);

        releaseOperationalLog?.();

        await vi.waitFor(() => expect(secondPlugin.log).toHaveBeenCalledOnce());

        expect(engine.removePlugin('second')).toBe(true);

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(firstPlugin) });

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(secondPlugin) });

        engine.auditLog(auditParameters());

        await vi.waitFor(() => expect(firstPlugin.auditLog).toHaveBeenCalledOnce());

        expect(engine.removePlugin('first')).toBe(true);

        releaseAuditLog?.();

        await vi.waitFor(() => expect(secondPlugin.auditLog).toHaveBeenCalledOnce());
    });

    it('should report failures raised while reporting plugin dispatch errors', async () => {
        const engine = LogEngine.getInstance();

        const failingPlugin: LoggingPluginContract = {
            'auditLog': vi.fn().mockRejectedValue(new Error('audit failure')),
            'dispose': vi.fn(),
            'id': 'failing',
            'log': vi.fn().mockRejectedValue(new Error('operational failure'))
        };

        await engine.addPlugin({ 'create': vi.fn().mockResolvedValue(failingPlugin) });

        errorSpy
            .mockImplementationOnce(() => { throw new Error('diagnostic unavailable'); })
            .mockImplementation(() => void 0);

        engine.log(operationalParameters());

        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));

        expect(errorSpy).toHaveBeenLastCalledWith(expect.stringContaining('Operational logging plugin failed: diagnostic unavailable'));

        errorSpy
            .mockReset()
            .mockImplementationOnce(() => { throw new Error('diagnostic unavailable'); })
            .mockImplementation(() => void 0);

        engine.auditLog(auditParameters());

        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));

        expect(errorSpy).toHaveBeenLastCalledWith(expect.stringContaining('Audit logging plugin failed: diagnostic unavailable'));
    });
});
