import { describe, expect, it, vi } from 'vitest';
import { Logger } from '#/Logger.js';
import { LogEngine } from '../bin/LogEngine';
import { LogLevel, OperationalLogParameters } from '../bin/interfaces/LogEngine';

type LogErrorFunc = (message: string, error?: Error | undefined, additionalContext?: string | number | Date | undefined) => void;
type LogMessageFunc = (message: string, additionalContext?: string | number | Date | undefined) => void;
type TheoryLogFunc = LogErrorFunc | LogMessageFunc;

interface LoggerTheoryParams {
    'name': string,
    'params': OperationalLogParameters;
    'method': TheoryLogFunc;
}

describe('Logger', () => {
    const message: string = 'message';
    const error: Error = new Error('test error');
    const context: string = 'test additional context';

    it.each([
        {
            'name': 'Calls log with Critical level, message, error and additional context',
            'params': {
                'additionalContext': context,
                'level': LogLevel.Critical,
                message,
                'stack': error.stack
            },
            'method': () => Logger.crit(message, error, context),
        },
        {
            'name': 'Calls log with Critical level, message, and error',
            'params': {
                'level': LogLevel.Critical,
                message,
                'stack': error.stack
            },
            'method': () => Logger.crit(message, error),
        },
        {
            'name': 'Calls log with Critical level and message',
            'params': {
                'level': LogLevel.Critical,
                message
            },
            'method': () => Logger.crit(message),
        },
        {
            'name': 'Calls log with Error level, message, error and additional context',
            'params': {
                'additionalContext': context,
                'level': LogLevel.Error,
                message,
                'stack': error.stack
            },
            'method': () => Logger.error(message, error, context),
        },
        {
            'name': 'Calls log with Error level, message, and error',
            'params': {
                'level': LogLevel.Error,
                message,
                'stack': error.stack
            },
            'method': () => Logger.error(message, error),
        },
        {
            'name': 'Calls log with Error level and message',
            'params': {
                'level': LogLevel.Error,
                message
            },
            'method': () => Logger.error(message),
        },
        {
            'name': 'Calls log with Warning level, message, and additional context',
            'params': {
                'level': LogLevel.Warning,
                message,
                'additionalContext': context
            },
            'method': () => Logger.warn(message, context),
        },
        {
            'name': 'Calls log with Warn level and message',
            'params': {
                'level': LogLevel.Warning,
                message
            },
            'method': () => Logger.warn(message),
        },
        {
            'name': 'Calls log with Information level, message, and additional context',
            'params': {
                'level': LogLevel.Information,
                message,
                'additionalContext': context
            },
            'method': () => Logger.info(message, context),
        },
        {
            'name': 'Calls log with Information level and message',
            'params': {
                'level': LogLevel.Information,
                message
            },
            'method': () => Logger.info(message),
        },
        {
            'name': 'Calls log with Debug level, message, and additional context',
            'params': {
                'level': LogLevel.Debug,
                message,
                'additionalContext': context
            },
            'method': () => Logger.debug(message, context),
        },
        {
            'name': 'Calls log with Debug level and message',
            'params': {
                'level': LogLevel.Debug,
                message
            },
            'method': () => Logger.debug(message),
        },
        {
            'name': 'Calls log with Trace level, message, and additional context',
            'params': {
                'level': LogLevel.Trace,
                message,
                'additionalContext': context
            },
            'method': () => Logger.trace(message, context),
        },
        {
            'name': 'Calls log with Trace level and message',
            'params': {
                'level': LogLevel.Trace,
                message
            },
            'method': () => Logger.trace(message),
        },

    ] satisfies LoggerTheoryParams[])('[Theory] $name', ({ params, method }) => {
        const getInstanceSpy = vi.spyOn(LogEngine, 'getInstance');
        const logSpy = vi.spyOn(LogEngine.prototype, 'log').mockImplementation(() => void 0);

        method();

        expect(getInstanceSpy).toHaveBeenCalledOnce();
        expect(logSpy).toHaveBeenCalledExactlyOnceWith(params);

    });
});
