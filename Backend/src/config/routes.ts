type AccessLevel = "public" | "authenticated" | "admin";

interface RouteConfig {
  method: string;
  path: string;
  access: AccessLevel;
}

const routes: RouteConfig[] = [
  { method: "GET", path: "/health", access: "public" },

  { method: "POST", path: "/api/auth/login", access: "public" },
  { method: "GET", path: "/api/auth/profile", access: "authenticated" },

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
  { method: "DELETE", path: "/api/categories/:id", access: "admin" },
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
