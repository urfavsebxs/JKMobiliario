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
];

const matchRoute = (configPath: string, requestPath: string): boolean => {
  const configParts = configPath.split("/");
  const requestParts = requestPath.split("/");

  if (configParts.length !== requestParts.length) return false;

  return configParts.every((part, i) => part.startsWith(":") || part === requestParts[i]);
};

export const getAccess = (method: string, path: string): AccessLevel => {
  const match = routes.find(
    (r) => r.method === method && matchRoute(r.path, path)
  );
  return match?.access ?? "authenticated";
};

export default routes;
