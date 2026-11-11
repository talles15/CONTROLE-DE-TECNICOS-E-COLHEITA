import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] },
});
