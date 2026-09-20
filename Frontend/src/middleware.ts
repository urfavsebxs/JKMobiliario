import { defineMiddleware } from "astro:middleware";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

/**
 * Rutas del panel abiertas al rol `trabajador`.
 *
 * El trabajador solo revisa comprobantes de pago: todo lo demás del panel
 * (productos, categorías, descuentos, modelos) sigue siendo exclusivo del
 * admin. Sin esta excepción el trabajador sería redirigido a `/` y la
 * pantalla quedaría inalcanzable.
 */
const RUTAS_TRABAJADOR = ["/admin/comprobantes"];

const puedeTrabajador = (pathname: string): boolean =>
  RUTAS_TRABAJADOR.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith("/admin")) {
    const token = context.cookies.get("token")?.value;

    if (!token) {
      return context.redirect("/login");
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        context.cookies.delete("token");
        return context.redirect("/login");
      }

      const data = await res.json();
      const rol = data.data.role;

      if (rol === "trabajador" && !puedeTrabajador(pathname)) {
        return context.redirect("/admin/comprobantes");
      }

      if (rol !== "admin" && rol !== "trabajador") {
        return context.redirect("/");
      }
    } catch {
      context.cookies.delete("token");
      return context.redirect("/login");
    }
  }

  return next();
});
