import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      'db/**',
      'graphify-out/**',
      'apps/web/src/components/ui/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // catches values pasted straight into SQL strings, use ? instead
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^(query|queryOne|execute)$/] > TemplateLiteral:first-child > :not(TemplateElement):not(Identifier[name=/^sql[A-Z]/])',
          message:
            'Never interpolate values into SQL: use ? placeholders. Fixed fragments you built yourself must live in a variable named sqlXxx (e.g. sqlWhere).',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
