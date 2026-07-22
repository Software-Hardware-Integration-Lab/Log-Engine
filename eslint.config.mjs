import { eslintConfig as baseLintConfig } from '@software-hardware-integration-lab/development-utilities/optimized/lint/base.js'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
    ...baseLintConfig,
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
            "capitalized-comments": [
                "error",
                "always",
                {
                    "ignorePattern": "v8|ignored",
                    "ignoreInlineComments": true
                }
            ],
            "@typescript-eslint/class-methods-use-this": [
                "warn",
                {
                    "ignoreOverrideMethods": true
                }
            ],
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
    globalIgnores(['coverage/', 'scripts/', 'tests/', 'vitest.config.ts'])
])
