import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow (the site is served from /DressRight/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: { environment: 'node' },
} as never);
