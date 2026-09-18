import type { Product, ProductsResponse, AuthResponse } from "./types";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
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
