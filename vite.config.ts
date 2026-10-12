import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
