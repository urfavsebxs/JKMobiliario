// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// El optimizador de Vite comparte caché entre `dev` y `build`. Si se construye
// con el dev server vivo, React queda cacheado en su variante de producción y
// los islands fallan en el navegador con "jsxDEV is not a function".
const cacheDir = process.argv.includes('build')
  ? 'node_modules/.vite/build'
  : 'node_modules/.vite/dev';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
    cacheDir
  }
});
