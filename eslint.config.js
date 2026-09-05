import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'docs', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    /*
     * The render layer drives a game loop, not a React render.
     *
     * `react-hooks/immutability` is a React Compiler purity rule: it forbids
     * mutating anything a hook returned. That is right for render code and
     * wrong for a `useFrame` callback, which is a per-frame imperative loop
     * outside React's render and commit phases entirely. Every three.js
     * component mutates matrices, uniforms and materials there, and the
     * alternative -- rebuilding a Vector3 sixty times a second per entity --
     * is precisely the per-frame allocation the performance budget forbids.
     *
     * Scoped as narrowly as possible: only this rule, only under src/render.
     * `rules-of-hooks` and `exhaustive-deps` stay on everywhere, and the whole
     * rule set stays on for ui/, systems/, state/ and sim/.
     */
    files: ['src/render/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  {
    // The sim layer is the headless authority. It must never reach for a
    // renderer, React, or the DOM -- that separation is what makes it testable.
    files: ['src/sim/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'sim/ and data/ must stay renderer-free.' },
            {
              group: ['react', 'react/*', 'react-dom*'],
              message: 'sim/ and data/ must stay React-free.',
            },
            { group: ['@react-three/*'], message: 'sim/ and data/ must stay renderer-free.' },
          ],
        },
      ],
    },
  },
);
