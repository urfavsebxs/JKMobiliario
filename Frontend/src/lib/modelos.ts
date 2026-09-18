/**
 * Resuelve el problema de Mixed Content cuando MinIO está en HTTP
 * y el frontend en HTTPS (Vercel).
 *
 * Los modelos GLB se cargan con `useGLTF` (no con `<img>`), así que no pueden
 * reutilizar el helper de imágenes: las URLs HTTP pasan por /api/proxy-model.
 */
export function proxyModelUrl(url: string | undefined | null): string {
  if (!url) return "";

  // Modelos locales (p. ej. /models/mueble.glb) se sirven tal cual.
  if (url.startsWith("/")) return url;

  try {
    const { protocol } = new URL(url);

    // En producción (Vercel), MinIO en HTTP debe pasar por el proxy.
    if (protocol === "http:") {
      return `/api/proxy-model?url=${encodeURIComponent(url)}`;
    }

    // HTTPS ya es seguro para el navegador; data:/blob: también pasan tal cual.
    return url;
  } catch {
    // URL inválida: se devuelve sin proxy y el visor muestra su estado de error.
    return url;
  }
}
