import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { coverageThresholds } from './scripts/coverage-thresholds.js';

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
            'thresholds': coverageThresholds,
            'reporter': [
                'text',
                'html',
                'lcov',
                'json-summary'
            ]
        }
    }
});
