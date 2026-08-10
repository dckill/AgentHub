import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
  },
  // Restrict path mapping discovery to this package. Crawling the repository
  // workspace also visits parallel `.worktrees` and emits unrelated Expo
  // tsconfig warnings during every Server test startup.
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })]
});
