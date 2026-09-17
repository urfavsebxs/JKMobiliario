export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductVariant {
  size: string;
  color: string;
  colorHex: string;
  stock: number;
  price?: number;
  sku?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface ProductsResponse {
  products: Product[];
  total: number;
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
