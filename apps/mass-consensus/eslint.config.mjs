// ESLint 8 looks for a flat config up the tree and would otherwise pick the
// repo-root eslint.config.js (ESLint 9 + root typescript-eslint), which crashes
// here. This keeps MC on its own deps and its own .eslintrc.json rules.
import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('./.eslintrc.json'),
  // One-off CLI scripts: printing is their output
  { files: ['scripts/**', 'check-survey-data.ts'], rules: { 'no-console': 'off' } },
  // CommonJS config files
  { files: ['*.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];

export default config;
