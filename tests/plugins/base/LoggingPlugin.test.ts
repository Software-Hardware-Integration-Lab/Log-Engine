import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggingPlugin } from '#/plugins/base/LoggingPlugin.js';
import type { AuditLog, OperationalLog } from '#/interfaces/LogEngine.js';
import type { LoggingPluginConfigurationOptions } from '#/interfaces/plugins/LoggingPlugin.js';

class TestPlugin extends LoggingPlugin {
    public constructor(id = 'test-plugin') {
        super(id);
    }

    public static configuredDebug(configuration: unknown, object?: unknown, message?: unknown): void {
        this.writeConfiguredDebugInfo(configuration, object, message);
    }

    public static debugWhen(enabled: boolean, object?: unknown, message?: unknown): void {
        this.writeDebugInfoWhen(enabled, object, message);
    }

    public static defaultShouldWriteLogs(): boolean {
        return this.defaultGetShouldWriteLogs();
    }

    public static resolveConfiguration(configuration: unknown, defaultConfiguration: LoggingPluginConfigurationOptions) {
        return this.resolveConfigurationOptions(configuration, defaultConfiguration);
    }

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    public async auditLog(_log: AuditLog): Promise<void> { }

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    public async log(_log: OperationalLog): Promise<void> { }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('logging plugin configuration', () => {
    it('should resolve caller predicates and exclude them from schema validation input', () => {
        const audit = vi.fn(() => false);

        const debug = vi.fn(() => true);

        const operational = vi.fn(() => false);

        const defaults: LoggingPluginConfigurationOptions = {
            'getShouldWriteAuditLogs': () => true,
            'getShouldWriteDebugInfo': () => false,
            'getShouldWriteOperationalLogs': () => true
        };

        const resolved = TestPlugin.resolveConfiguration({
            'getShouldWriteAuditLogs': audit,
            'getShouldWriteDebugInfo': debug,
            'getShouldWriteOperationalLogs': operational,
            'option': 'retained'
        }, defaults);

        expect(resolved.getShouldWriteAuditLogs).toBe(audit);

        expect(resolved.getShouldWriteDebugInfo).toBe(debug);

        expect(resolved.getShouldWriteOperationalLogs).toBe(operational);

        expect(resolved.validationInput).toEqual({
            'getShouldWriteAuditLogs': void 0,
            'getShouldWriteDebugInfo': void 0,
            'getShouldWriteOperationalLogs': void 0,
            'option': 'retained'
        });

        expect(TestPlugin.defaultShouldWriteLogs()).toBe(true);
    });

    it('should use defaults when configuration is missing or predicate values are not functions', () => {
        const defaults: LoggingPluginConfigurationOptions = {
            'getShouldWriteAuditLogs': () => true,
            'getShouldWriteDebugInfo': () => true,
            'getShouldWriteOperationalLogs': () => true
        };

        const resolved = TestPlugin.resolveConfiguration({ 'getShouldWriteAuditLogs': false }, defaults);

        expect(resolved.getShouldWriteAuditLogs).toBe(defaults.getShouldWriteAuditLogs);

        expect(TestPlugin.resolveConfiguration(null, defaults).validationInput).toBeNull();
    });
});

describe('LoggingPlugin', () => {
    it('should expose an immutable enumerable identifier', () => {
        const plugin = new TestPlugin();

        expect(plugin.id).toBe('test-plugin');

        expect(Object.keys(plugin)).toContain('id');

        expect(() => { (plugin as { 'id': string; }).id = 'changed'; }).toThrow();
    });

    it('should write enabled diagnostic messages and objects using appropriate console methods', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const dir = vi.spyOn(console, 'dir').mockImplementation(() => void 0);

        const error = new Error('broken');

        TestPlugin.debugWhen(true, error, error);

        TestPlugin.debugWhen(true, { 'nested': true }, { 'message': 'object' });

        TestPlugin.debugWhen(false, { 'ignored': true }, 'ignored');

        expect(log).toHaveBeenCalledWith(expect.stringContaining('broken'));

        expect(log).toHaveBeenCalledWith('Error message: broken');

        expect(dir).toHaveBeenCalledWith({ 'nested': true }, { 'depth': null });

        expect(log).not.toHaveBeenCalledWith(expect.stringContaining('ignored'));
    });

    it('should preserve primitive, void 0, and empty-error diagnostics', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        const dir = vi.spyOn(console, 'dir').mockImplementation(() => void 0);

        TestPlugin.debugWhen(true, void 0, 4);

        TestPlugin.debugWhen(true, void 0, true);

        TestPlugin.debugWhen(true, void 0, 1n);

        TestPlugin.debugWhen(true, { 'value': true });

        TestPlugin.debugWhen(true, new Error(''));

        expect(log).toHaveBeenCalledWith('\n4');

        expect(log).toHaveBeenCalledWith('\ntrue');

        expect(log).toHaveBeenCalledWith('\n1');

        expect(log).toHaveBeenCalledWith('\n');

        expect(dir).toHaveBeenCalledWith({ 'value': true }, { 'depth': null });

        expect(log).toHaveBeenCalledWith(expect.stringContaining('Error'));
    });

    it('should emit a failover diagnostic when console logging itself throws', () => {
        const log = vi.spyOn(console, 'log')
            .mockImplementationOnce(() => { throw new Error('console failure'); })
            .mockImplementation(() => void 0);

        TestPlugin.debugWhen(true, void 0, 'message');

        expect(log).toHaveBeenLastCalledWith('\n[TestPlugin Debug Log Failure] console failure');
    });

    it('should fail closed when debug is disabled, malformed, or its predicate throws', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => void 0);

        TestPlugin.configuredDebug(null, 'value', 'message');

        TestPlugin.configuredDebug({}, 'value', 'message');

        TestPlugin.configuredDebug({ 'getShouldWriteDebugInfo': () => { throw new Error('predicate'); } }, 'value', 'message');

        expect(log).not.toHaveBeenCalled();
    });
});
