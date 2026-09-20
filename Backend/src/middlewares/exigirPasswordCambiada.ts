import { Response, NextFunction } from "express";
import { AuthRequest } from "./accessControl";

/**
 * Rutas que un usuario con contraseña temporal SÍ puede usar.
 *
 * Es exactamente lo que necesita para cambiar su contraseña y nada más: verse
 * a sí mismo y cambiarla. Cualquier otra cosa que se le ocurra hacer espera a
 * que la cambie.
 *
 * `/api/auth/logout` NO está aquí porque no existe en el backend: el cierre de
 * sesión es un endpoint de Astro que borra las cookies, y el token deja de
 * valer por su cuenta al subir `tokenVersion`.
 */
const RUTAS_EXENTAS = [
  "/api/auth/login",
  "/api/auth/profile",
  "/api/auth/change-password",
  "/health",
];

/** Igual que en `accessControl`: barras finales fuera y a minúsculas. */
const normalizar = (path: string): string => (path.replace(/\/+$/, "") || "/").toLowerCase();

/**
 * Bloquea el uso del sistema mientras la contraseña siga siendo la temporal.
 *
 * Va montado globalmente justo después de `accessControl`, por el mismo motivo
 * que él: así ningún módulo futuro puede olvidarse de aplicarlo. Es la capa
 * que de verdad cierra el paso — las redirecciones del frontend son comodidad,
 * esto es lo que impide que un token temporal sirva para llamar a la API.
 *
 * Solo actúa si `req.user` existe, es decir, en rutas con nivel de rol. En las
 * `public` y las `service` (la ingesta de n8n) `accessControl` no asigna
 * `req.user`, así que quedan intactas: un cliente anónimo mirando el catálogo
 * o un comprobante entrando por el webhook no se ven afectados.
 */
export const exigirPasswordCambiada = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.debeCambiarPassword) {
    next();
    return;
  }

  if (RUTAS_EXENTAS.includes(normalizar(req.path))) {
    next();
    return;
  }

  // `codigo` es lo que el panel usa para distinguir este 403 de un "no tienes
  // permiso" normal y mandar al usuario a la pantalla de cambio en vez de
  // pintarle un error que no sabría interpretar.
  //
  // `no-store` porque esta respuesta depende de quién la pide: un proxy
  // intermedio que la cacheara se la serviría a otro usuario, que vería un 403
  // sin haber fallado nada.
  res.set("Cache-Control", "no-store");
  res.status(403).json({
    success: false,
    codigo: "PASSWORD_TEMPORAL",
    message: "Debes cambiar tu contraseña temporal antes de continuar",
  });
};
