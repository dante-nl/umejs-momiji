import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig([
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
    },
    {
        files: ['**/*.{js,mjs,cjs}'],
        plugins: { js },
        extends: [js.configs.recommended],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                hljs: 'readonly',
            },
        },
        rules: {
            'no-control-regex': 0,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
]);
