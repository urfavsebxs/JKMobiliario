/**
 * Resuelve el problema de Mixed Content cuando MinIO está en HTTP
 * y el frontend en HTTPS (Vercel).
 *
 * Todas las URLs de imagen de MinIO pasan por /api/proxy-image
 * para que el navegador las cargue por HTTPS.
 */
export function proxyImageUrl(url: string | undefined | null): string {
  if (!url) return "";

  // Solo proxy para URLs de MinIO (HTTP)
  // En desarrollo local no se necesita proxy
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return url;
  }

  // En producción (Vercel), pasar por el proxy
  if (url.startsWith("http://")) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }

  return url;
}
