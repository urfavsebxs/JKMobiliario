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

// Vite bloquea las peticiones cuyo Host no sea localhost (protección contra
// DNS rebinding) con "Blocked request. This host is not allowed". Para túneles
// de desarrollo se autorizan aquí:
//   - ".ngrok-free.dev" cubre cualquier subdominio gratuito de ngrok (rotan).
//   - DEV_ALLOWED_HOSTS añade dominios extra sin tocar código, separados por
//     comas. Ej: DEV_ALLOWED_HOSTS=".trycloudflare.com,mi-tunel.dev" pnpm dev
const allowedHosts = [
  '.ngrok-free.dev',
  ...(process.env.DEV_ALLOWED_HOSTS?.split(',') ?? []),
]
  .map((host) => host.trim())
  .filter(Boolean);

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: vercel(),
  server: {
    allowedHosts,
  },
  vite: {
    plugins: [tailwindcss()],
    cacheDir
  }
});
