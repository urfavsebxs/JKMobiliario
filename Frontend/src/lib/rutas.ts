/**
 * A dónde va cada usuario después de entrar.
 *
 * Vive aquí y no repetido en cada sitio porque la decisión se toma en cuatro
 * lugares distintos —dos en el servidor (`pages/api/auth/login.ts` y
 * `middleware.ts`), uno en el cliente (`login.astro`) y uno en el Nav— y ya
 * había cuatro copias de la misma expresión ternaria. Añadir el caso de la
 * contraseña temporal a mano en las cuatro era pedir que alguna se quedara
 * atrás, y la que se quedara atrás sería la que deja pasar.
 *
 * `User` se tipa estructuralmente (no se importa `lib/types`) para poder usarlo
 * desde el middleware, que corre en el servidor.
 */

/** Ruta donde se cambia la contraseña temporal. */
export const RUTA_CAMBIO_PASSWORD = "/cambio-password";

/** Rutas del panel abiertas al rol `trabajador`. */
export const RUTAS_TRABAJADOR = ["/admin/comprobantes"];

interface UsuarioParaRuta {
  role?: string;
  debeCambiarPassword?: boolean;
}

const esAdmin = (user: UsuarioParaRuta): boolean => user.role === "admin";
const esTrabajador = (user: UsuarioParaRuta): boolean => user.role === "trabajador";

/** Puede entrar a la revisión de comprobantes. */
export const puedeTrabajador = (pathname: string): boolean =>
  RUTAS_TRABAJADOR.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));

/**
 * Destino tras iniciar sesión.
 *
 * La contraseña temporal gana sobre el rol: mientras no se cambie, el usuario
 * no va a su panel sino a la pantalla de cambio. Sin sesión, al login.
 */
export const destinoTrasLogin = (user: UsuarioParaRuta | null | undefined): string => {
  if (!user) return "/login";
  if (user.debeCambiarPassword) return RUTA_CAMBIO_PASSWORD;
  if (esAdmin(user)) return "/admin";
  if (esTrabajador(user)) return "/admin/comprobantes";
  return "/";
};

/**
 * Destino tras cambiar la contraseña. Aquí el flag ya está en `false`, así que
 * es el destino normal por rol.
 */
export const destinoTrasCambioPassword = (role: string | undefined): string => destinoTrasLogin({ role });
