import { defineConfig } from 'tsup';

import type { Options } from 'tsup';

const shared: Options = {
  outDir: 'dist',
  format: ['iife'],
  target: 'chrome108',
  bundle: true,
  minify: false,
  sourcemap: true,
  clean: false,
  outExtension: () => ({ js: '.js' }),
};

export default defineConfig([
  {
    ...shared,
    entry: { background: 'src/background/index.ts' },
    globalName: 'BackgroundScript',
  },
  {
    ...shared,
    entry: { content: 'src/content/main.ts' },
    globalName: 'ContentScript',
  },
  {
    ...shared,
    entry: { manager: 'src/options/manager.ts' },
    globalName: 'ManagerScript',
  },
]);
