import { defineConfig, globalIgnores } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';

export default defineConfig([
  globalIgnores(['node_modules/', '.next/', 'out/', 'dist/']),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error',
        {
          selector: 'JSXOpeningElement[name.name="head"]',
          message: '禁止使用 head 标签，优先使用 metadata。'
        }
      ]
    }
  }
]);
