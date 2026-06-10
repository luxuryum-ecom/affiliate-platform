import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Config de test isolée — alias '@' → src, environnement Node (server actions).
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
