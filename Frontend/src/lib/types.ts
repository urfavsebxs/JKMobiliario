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
  /**
   * `true` mientras la contraseña vigente sea la temporal que generó un
   * administrador. Opcional para no romper las sesiones ya guardadas en
   * `localStorage`, que se serializaron sin este campo.
   */
  debeCambiarPassword?: boolean;
}

/** Cuenta del panel tal como la devuelve `GET /api/users`. */
export interface UsuarioPanel {
  _id: string;
  name: string;
  email: string;
  role: string;
  activo: boolean;
  debeCambiarPassword: boolean;
  creadoPor?: string;
  createdAt: string;
}

/** Respuesta de crear o regenerar una contraseña temporal. */
export interface UsuarioConCredencial {
  usuario: UsuarioPanel;
  /** Se muestra UNA sola vez; no vuelve a poder consultarse. */
  passwordTemporal: string;
}

/** Prioridad de revisión del comprobante, de menor a mayor urgencia. */
export type NivelAlerta = "ninguno" | "revisar" | "urgente";

export type EstadoComprobante = "pendiente" | "aprobado" | "rechazado";

/** Motivo de rechazo de la lista cerrada del backend. */
export interface MotivoRechazo {
  clave: string;
  etiqueta: string;
}

/**
 * Comprobante de pago recibido por WhatsApp.
 * La imagen NO se referencia por URL: el endpoint exige token, así que se pide
 * aparte y se muestra como blob (ver AdminComprobantes).
 */
export interface Comprobante {
  _id: string;
  fecha: string;
  telefono: string;
  nombreCliente?: string;
  /**
   * Nombre del perfil de WhatsApp del cliente. Los comprobantes casi nunca
   * traen el nombre de quien paga (lo que traen es el del comercio), así que
   * este es el dato con el que se identifica al cliente en el panel.
   */
  nombrePerfilWhatsApp?: string;
  producto?: string;
  monto?: number;
  bancoOrigen?: string;
  referenciaPago?: string;
  fechaPago?: string;
  estado: EstadoComprobante;
  alerta: NivelAlerta;
  motivoAlerta?: string;
  revisadoPor?: string;
  fechaRevision?: string;
  motivoRechazo?: string;
  notificadoCliente: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
