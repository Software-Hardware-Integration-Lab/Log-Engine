import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    'resolve': {
        'alias': {
            '#': fileURLToPath(new URL('./bin', import.meta.url))
        }
    },
    'test': {
        'environment': 'node',
        'include': ['tests/**/*.test.ts'],
        'coverage': {
            'provider': 'v8',
            'include': ['bin/**/*.js'],
            'exclude': [
                'bin/**/*.d.ts',
                'bin/**/index.js'
            ],
            'thresholds': {
                'branches': 85,
                'functions': 99,
                'lines': 95,
                'statements': 95
            },
            'reporter': [
                'text',
                'html',
                'lcov'
            ]
        }
    }
});
