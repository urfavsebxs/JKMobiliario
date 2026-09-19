export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductVariant {
  size: string;
  /** Color de la variante; opcional cuando el precio depende solo del tamaño. */
  color?: string;
  colorHex?: string;
  stock: number;
  price?: number;
  sku?: string;
}

/** Medidas reales del modelo 3D en centímetros. */
export interface MedidasBase {
  ancho?: number;
  largo?: number;
  alto?: number;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  dimensions: string;
  price: number;
  stock: number;
  images: string[];
  category: string;
  sizes: string[];
  colors: ProductColor[];
  variants: ProductVariant[];
  /** URL del modelo GLB para el visor 3D (opcional). */
  model3d?: string;
  /** Medidas reales del modelo 3D en cm, para calcular su escala (opcional). */
  medidasBase?: MedidasBase;
  /** Porcentaje de descuento visible al cliente, 0–100 (opcional). */
  discountPercent?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductsResponse {
  products: Product[];
  total: number;
}

/** Categoría administrable del catálogo (colección propia en el backend). */
export interface Category {
  _id: string;
  name: string;
  group: string;
  order: number;
  image?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
