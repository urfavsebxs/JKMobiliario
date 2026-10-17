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
  // Reintento del aviso al cliente: es una acción de la misma pantalla de
  // revisión, así que el mismo nivel que revisar.
  { method: "POST", path: "/api/comprobantes/:id/notificar", access: "trabajador" },

  // Fichas de cliente (lo que el asesor recuerda de quien vuelve a escribir).
  // `service`: las llama n8n — la lectura antes de responder y el upsert del
  // paso automático después. n8n no tiene JWT, así que sin declararlas aquí
  // recibiría un 401 del nivel por defecto.
  { method: "GET", path: "/api/clientes/ficha", access: "service" },
  { method: "POST", path: "/api/clientes/ficha", access: "service" },
  // `trabajador`: consultar la ficha es parte de atender al cliente.
  { method: "GET", path: "/api/clientes", access: "trabajador" },
  { method: "GET", path: "/api/clientes/:id", access: "trabajador" },
  // `admin`: corregir el dato del cliente es del dueño, no de cualquiera que
  // atienda. Si algún día un trabajador debe anotar, se cambia aquí y ya.
  { method: "PATCH", path: "/api/clientes/:id", access: "admin" },

  // Zonas de entrega (qué departamentos cubre el envío).
  // `service`: la consulta la hace n8n cuando el asesor pregunta la ciudad. El
  // nivel por defecto (`authenticated`) la dejaría fuera del alcance de n8n,
  // que no tiene JWT, y el asesor no podría confirmar cobertura.
  { method: "GET", path: "/api/zonas/consulta", access: "service" },
  // `public`: solo devuelve la lista de departamentos donde se entrega, sin
  // notas ni departamentos desactivados. La lee el asesor del chat de la web,
  // que corre en Vercel y no tiene la clave de servicio.
  { method: "GET", path: "/api/zonas/publicas", access: "public" },
  // `admin`: dejar un departamento, un municipio o un barrio sin entrega es una
  // decisión del dueño.
  { method: "GET", path: "/api/zonas", access: "admin" },
  { method: "POST", path: "/api/zonas", access: "admin" },
  { method: "PATCH", path: "/api/zonas/:id", access: "admin" },
  { method: "DELETE", path: "/api/zonas/:id", access: "admin" },

  // Mensajes que el negocio ya envió, para resolver las respuestas citadas.
  // `service` en las dos: las llama n8n. La de lectura devuelve a qué mensaje
  // respondió el cliente, así que tampoco puede quedar abierta.
  { method: "POST", path: "/api/mensajes/enviado", access: "service" },
  { method: "GET", path: "/api/mensajes/enviado", access: "service" },

  // Tráfico de la página.
  // `public`: la manda el navegador de cualquier visitante, que no tiene
  // sesión. El cuerpo lo cierra `visitaSchema` (`.strict()`): solo entran la
  // ruta y el referer, y el resto lo deduce el servidor.
  { method: "POST", path: "/api/trafico/visita", access: "public" },
  // `admin`: el tráfico de la tienda es información del dueño, no de cualquiera
  // con sesión abierta en un equipo compartido.
  { method: "GET", path: "/api/trafico/resumen", access: "admin" },

  // Conversaciones de WhatsApp guardadas en la memoria de n8n.
  // `admin` en las dos: son conversaciones reales de clientes con nombre,
  // teléfono y lo que preguntaron. El nivel por defecto (`authenticated`) dejaría
  // que cualquier sesión abierta en un equipo compartido las leyera.
  { method: "GET", path: "/api/conversaciones", access: "admin" },
  { method: "GET", path: "/api/conversaciones/:sessionId", access: "admin" },
  // Las fotos que mandó el cliente en esa conversación (bucket privado, servidas
  // con sesión). Mismo nivel que leer la conversación.
  { method: "GET", path: "/api/conversaciones/:sessionId/imagenes/:archivo", access: "admin" },
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
