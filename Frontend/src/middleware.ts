import { defineMiddleware } from "astro:middleware";
import { RUTA_CAMBIO_PASSWORD, puedeTrabajador } from "./lib/rutas";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

/**
 * El guard solo cubre `/admin` (ver `onRequest`), así que `/cambio-password`
 * necesita su propia comprobación dentro de la página. Aquí solo se evita que
 * un usuario ya migrado vuelva a ella.
 */
/**
 * Ninguna respuesta del panel se guarda en caché del navegador.
 *
 * Esto no es optimización, es la mitad del problema de "otra persona entró sin
 * credenciales" en equipos compartidos: con la página en la caché de ida y
 * vuelta (bfcache), alguien que pulsaba "atrás" después de cerrar sesión volvía
 * a ver el panel pintado —con sus productos y sus comprobantes— sin pasar por
 * el servidor, así que el guard de abajo no llegaba a ejecutarse. Sin caché, el
 * navegador tiene que volver a preguntar, y ahí el guard decide.
 */
const sinCache = (respuesta: Response): Response => {
  respuesta.headers.set("Cache-Control", "no-store");
  return respuesta;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // La pantalla de cambio vive fuera de `/admin`, así que no pasa por el guard
  // de abajo: se protege sola dentro de la página.
  if (pathname === RUTA_CAMBIO_PASSWORD) {
    return next();
  }

  if (pathname.startsWith("/admin")) {
    const token = context.cookies.get("token")?.value;

    if (!token) {
      return sinCache(context.redirect("/login"));
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        context.cookies.delete("token");
        return sinCache(context.redirect("/login"));
      }

      const data = await res.json();
      const usuario = data.data;
      const rol = usuario.role;

      // Contraseña temporal sin cambiar: no entra al panel. Aunque llegara
      // (p. ej. escribiendo la URL), el backend le respondería 403 a todo.
      if (usuario.debeCambiarPassword) {
        return sinCache(context.redirect(RUTA_CAMBIO_PASSWORD));
      }

      if (rol === "trabajador" && !puedeTrabajador(pathname)) {
        return sinCache(context.redirect("/admin/comprobantes"));
      }

      if (rol !== "admin" && rol !== "trabajador") {
        return sinCache(context.redirect("/"));
      }
    } catch {
      context.cookies.delete("token");
      return sinCache(context.redirect("/login"));
    }

    return sinCache(await next());
  }

  return next();
});
