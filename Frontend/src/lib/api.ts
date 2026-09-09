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
