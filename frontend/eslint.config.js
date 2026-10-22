import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Workflow payloads are intentionally heterogeneous. Replacing every
      // boundary value with pretend static types would reduce readability
      // without making runtime data safer; validation/coercion happens in the
      // contract layer instead.
      '@typescript-eslint/no-explicit-any': 'off',

      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'src/tests/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
