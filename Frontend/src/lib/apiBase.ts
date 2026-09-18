/**
 * Base de la API para llamadas desde el navegador.
 *
 * El build puede quedar configurado con una URL HTTP (p. ej. la IP del VPS),
 * que el navegador bloquea por contenido mixto cuando el sitio se sirve por
 * HTTPS. En ese caso se usa el dominio HTTPS público de la misma API.
 */
const CONFIGURADA = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";
const HTTPS_PUBLICA = import.meta.env.PUBLIC_API_URL_HTTPS || "https://api.jkmobiliario.digital";

function resolver(): string {
  if (typeof window === "undefined") return CONFIGURADA; // SSR: no aplica
  if (window.location.protocol === "https:" && CONFIGURADA.startsWith("http:")) {
    return HTTPS_PUBLICA;
  }
  return CONFIGURADA;
}

export const API_URL = resolver();
