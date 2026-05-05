import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Pure-logic tests don't need a DOM. If you later add component tests,
    // switch to 'jsdom' and install jsdom as a devDep.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Avoid pulling in Next.js plugins or app-router runtime
    globals: false,
    reporters: 'default',
  },
})
