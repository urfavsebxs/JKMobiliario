import type { Category, Product, ProductsResponse, AuthResponse } from "./types";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

/** Tiempo máximo de espera de la API antes de abortar (ms). */
const TIMEOUT_MS = 4000;

/**
 * Petición JSON con timeout por defecto. El llamador puede imponer su propio
 * `signal`; si no lo hace, se aborta a los {@link TIMEOUT_MS} ms para que una
 * respuesta colgada del backend no bloquee el render SSR.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { signal, ...resto } = options ?? {};

  const res = await fetch(`${API_URL}${path}`, {
    ...resto,
    headers: {
      "Content-Type": "application/json",
      ...resto.headers,
    },
    signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Error en la solicitud");
  }

  return data.data || data;
}

export async function getProducts(page = 1, limit = 12): Promise<ProductsResponse> {
  return request<ProductsResponse>(`/api/products?page=${page}&limit=${limit}`);
}

/** Tamaño de página máximo aceptado por el backend. */
const PAGE_SIZE = 100;
/** Tope de seguridad de peticiones para no encadenar páginas sin fin. */
const MAX_PAGES = 20;

/**
 * Obtiene todos los productos paginando `getProducts(page, 100)`.
 * Acumula y deduplica por `_id` (por si el backend solapa páginas) hasta
 * alcanzar `total`, con un tope de seguridad de 20 páginas. Si una página
 * vuelve vacía, corta. Los errores de red se propagan para que cada página
 * conserve su manejo actual.
 */
export async function getAllProducts(): Promise<Product[]> {
  const acumulados: Product[] = [];
  const vistos = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { products, total } = await getProducts(page, PAGE_SIZE);

    // Página vacía: ya no hay más datos que traer.
    if (products.length === 0) break;

    for (const product of products) {
      if (vistos.has(product._id)) continue;
      vistos.add(product._id);
      acumulados.push(product);
    }

    // Última página (menos resultados que el tamaño pedido) o total alcanzado.
    if (products.length < PAGE_SIZE || acumulados.length >= total) break;
  }

  return acumulados;
}

export async function getProductById(id: string): Promise<Product> {
  return request<Product>(`/api/products/${id}`);
}

/**
 * Valida y normaliza un ítem de categoría venido de la API. Exige un `name`
 * string no vacío y completa el resto de campos con valores seguros; devuelve
 * `null` si el ítem no sirve.
 */
function categoriaValida(item: unknown): Category | null {
  if (!item || typeof item !== "object") return null;

  const bruto = item as Record<string, unknown>;
  const name = typeof bruto.name === "string" ? bruto.name.trim() : "";
  if (!name) return null;

  const group =
    typeof bruto.group === "string" && bruto.group.trim() ? bruto.group.trim() : name;
  const order =
    typeof bruto.order === "number" && Number.isFinite(bruto.order) ? bruto.order : 0;
  const image =
    typeof bruto.image === "string" && bruto.image.trim() ? bruto.image.trim() : undefined;
  const _id = typeof bruto._id === "string" ? bruto._id : "";

  return { _id, name, group, order, image };
}

/**
 * Categorías del catálogo (endpoint público).
 *
 * Valida la forma de la respuesta y nunca lanza: ante error de red o datos que
 * no sean un arreglo devuelve `[]`. Los ítems malformados (null, sin `name`…)
 * se descartan para que `agruparCategorias` no pueda romper el SSR. Cada
 * consumidor aplica después su respaldo local (`CATEGORIAS_POR_DEFECTO`).
 */
export async function getCategorias(): Promise<Category[]> {
  try {
    const data = await request<unknown>("/api/categories");
    if (!Array.isArray(data)) return [];

    return data
      .map(categoriaValida)
      .filter((categoria): categoria is Category => categoria !== null);
  } catch {
    return [];
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function getProfile(token: string) {
  return request<{ id: string; name: string; email: string; role: string }>("/api/auth/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
