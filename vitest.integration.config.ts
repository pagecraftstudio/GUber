import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Integration tests talk to a real PostgREST + Postgres (see tests/integration/README.md). Not part of `npm test`.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'server-only': fileURLToPath(new URL('./tests/integration/server-only-stub.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/integration/**/*.int.test.ts'], testTimeout: 30_000, fileParallelism: false },
});
