import { defineConfig, globalIgnores } from 'eslint/config'
import { eslintConfig } from '@shi-corp/development-utilities/optimized/lint/base.js'

export default defineConfig([
    ...eslintConfig,
    {
        rules: {
            'jsdoc/require-jsdoc': [
                'warn',
                {
                    'publicOnly': { 'esm': true },
                    'contexts': [
                        'ExportNamedDeclaration > ClassDeclaration',
                        'ExportNamedDeclaration > FunctionDeclaration',
                        'ExportNamedDeclaration > TSInterfaceDeclaration',
                        'ExportNamedDeclaration > TSTypeAliasDeclaration',
                        'ExportDefaultDeclaration > ClassDeclaration',
                        'ExportDefaultDeclaration > FunctionDeclaration'
                    ],
                    'require': {
                        'ArrowFunctionExpression': false,
                        'ClassDeclaration': true,
                        'FunctionDeclaration': true,
                        'FunctionExpression': false,
                        'MethodDefinition': false
                    }
                }
            ],
            'no-continue': 'off',
            'sort-imports': 'off',
            'sort-keys': 'off',
        }
    },
    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './vitest.tsconfig.json',
                projectService: false
            }
        },
        rules: {
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/no-deprecated': 'off',
            '@typescript-eslint/no-empty-function': 'off'
        }
    },
    globalIgnores(['coverage/', 'scripts/', 'sdk/', 'vitest.config.ts'])
])
