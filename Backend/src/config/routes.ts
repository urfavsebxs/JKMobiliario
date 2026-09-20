/**
 * Nivel de acceso de una ruta.
 *
 * - `public`: sin credenciales.
 * - `service`: sin JWT; exige el header `x-jk-service-key` (lo usa n8n para
 *   ingerir comprobantes). Si `JK_SERVICE_KEY` no está configurada, estas
 *   rutas quedan cerradas.
 * - `authenticated`: cualquier usuario con token válido, sin importar el rol.
 * - `trabajador`: admin **o** trabajador (el admin ve todo).
 * - `admin`: solo admin.
 */
export type AccessLevel = "public" | "service" | "authenticated" | "trabajador" | "admin";

interface RouteConfig {
  method: string;
  path: string;
  access: AccessLevel;
}

const routes: RouteConfig[] = [
  { method: "GET", path: "/health", access: "public" },

  { method: "POST", path: "/api/auth/login", access: "public" },
  { method: "GET", path: "/api/auth/profile", access: "authenticated" },
  // `authenticated`, no `admin`: es la ruta que usa el propio trabajador en su
  // primer login para salir de la contraseña temporal.
  { method: "POST", path: "/api/auth/change-password", access: "authenticated" },

  // Gestión de usuarios del panel.
  // `admin` en todas: crear cuentas, darlas de baja y regenerar credenciales
  // son operaciones de administración. El fallback de `getAccess` es
  // "authenticated", así que sin declararlas aquí cualquier usuario logueado
  // podría crearse un admin.
  { method: "GET", path: "/api/users", access: "admin" },
  { method: "POST", path: "/api/users", access: "admin" },
  { method: "PATCH", path: "/api/users/:id/activo", access: "admin" },
  { method: "POST", path: "/api/users/:id/password-temporal", access: "admin" },

  { method: "GET", path: "/api/products", access: "public" },
  { method: "GET", path: "/api/products/:id", access: "public" },
  { method: "POST", path: "/api/products", access: "admin" },
  { method: "PUT", path: "/api/products/:id", access: "admin" },
  { method: "DELETE", path: "/api/products/:id", access: "admin" },
  { method: "PATCH", path: "/api/products/:id/stock", access: "admin" },
  { method: "POST", path: "/api/products/:id/images", access: "admin" },
  { method: "DELETE", path: "/api/products/:id/image", access: "admin" },
  { method: "POST", path: "/api/products/:id/model", access: "admin" },
  { method: "DELETE", path: "/api/products/:id/model", access: "admin" },
  { method: "PATCH", path: "/api/products/:id/discount", access: "admin" },
  { method: "PATCH", path: "/api/products/:id/medidas", access: "admin" },

  { method: "GET", path: "/api/categories", access: "public" },
  { method: "POST", path: "/api/categories", access: "admin" },
  { method: "PUT", path: "/api/categories/:id", access: "admin" },
  { method: "DELETE", path: "/api/categories/:id", access: "admin" },

  // Comprobantes de pago.
  // `service`: los llama n8n con el header x-jk-service-key (no tiene JWT).
  { method: "POST", path: "/api/comprobantes/imagen", access: "service" },
  { method: "POST", path: "/api/comprobantes", access: "service" },
  // `trabajador`: la pantalla de revisión del panel (el admin también entra).
  { method: "GET", path: "/api/comprobantes", access: "trabajador" },
  { method: "GET", path: "/api/comprobantes/motivos-rechazo", access: "trabajador" },
  { method: "GET", path: "/api/comprobantes/:id", access: "trabajador" },
  { method: "GET", path: "/api/comprobantes/:id/imagen", access: "trabajador" },
  { method: "PATCH", path: "/api/comprobantes/:id", access: "trabajador" },
];

const matchRoute = (configPath: string, requestPath: string): boolean => {
  const configParts = configPath.toLowerCase().split("/");
  const requestParts = requestPath.split("/");

  if (configParts.length !== requestParts.length) return false;

  return configParts.every((part, i) => part.startsWith(":") || part === requestParts[i]);
};

export const getAccess = (method: string, path: string): AccessLevel => {
  // Normalización de seguridad: Express enruta con caseSensitive:false y
  // strict:false, así que "/API/PRODUCTS/<id>/discount/" llega tal cual.
  // Se normaliza el método a mayúsculas y el path a minúsculas sin barras
  // finales (la raíz "/" se conserva) para que esas variantes no caigan por
  // defecto en "authenticated" y eludan el nivel "admin".
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = (path.replace(/\/+$/, "") || "/").toLowerCase();

  const match = routes.find(
    (r) => r.method.toUpperCase() === normalizedMethod && matchRoute(r.path, normalizedPath)
  );
  return match?.access ?? "authenticated";
};

export default routes;
