import mongoose, { Document, Schema } from "mongoose";

export interface IProductVariant {
  size: string;
  /** Color de catálogo; opcional: hay catálogos con precio por tamaño/asientos y sin color. */
  color?: string;
  colorHex?: string;
  stock: number;
  price?: number;
  sku?: string;
}

export interface IProductColor {
  name: string;
  hex: string;
}

/** Medidas reales del modelo GLB, en centímetros. */
export interface IProductMedidasBase {
  ancho?: number;
  largo?: number;
  alto?: number;
}

export interface IProduct extends Document {
  name: string;
  description: string;
  dimensions: string;
  price: number;
  stock: number;
  images: string[];
  category: string;
  sizes: string[];
  colors: IProductColor[];
  variants: IProductVariant[];
  /** URL pública del modelo 3D (.glb) del producto, si tiene uno. */
  model3d?: string;
  /** Medidas reales del modelo GLB en centímetros; son la referencia para escalarlo a las medidas que pida el cliente. */
  medidasBase?: IProductMedidasBase;
  /** Descuento activo en porcentaje (0 = sin descuento). */
  discountPercent?: number;
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariant>(
  {
    size: { type: String, required: true },
    // Opcionales: camas y comedores varían por tamaño/asientos, no por color.
    color: { type: String },
    colorHex: { type: String },
    stock: { type: Number, required: true, min: 0, default: 0 },
    price: { type: Number, min: 0 },
    sku: { type: String },
  },
  { _id: false }
);

const productColorSchema = new Schema<IProductColor>(
  {
    name: { type: String, required: true },
    hex: { type: String, required: true },
  },
  { _id: false }
);

const medidasBaseSchema = new Schema<IProductMedidasBase>(
  {
    ancho: { type: Number, min: 0.1, max: 100000 },
    largo: { type: Number, min: 0.1, max: 100000 },
    alto: { type: Number, min: 0.1, max: 100000 },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    dimensions: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    images: { type: [String], default: [] },
    category: { type: String, default: "general" },
    sizes: { type: [String], default: [] },
    colors: { type: [productColorSchema], default: [] },
    variants: { type: [productVariantSchema], default: [] },
    model3d: { type: String },
    // Medidas reales del modelo GLB en centímetros; son la referencia para escalarlo a las medidas que pida el cliente.
    medidasBase: { type: medidasBaseSchema },
    // Descuento activo en porcentaje (0 = sin descuento).
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
  },
  { timestamps: true }
);

export const Product = mongoose.model<IProduct>("Product", productSchema, "product");
