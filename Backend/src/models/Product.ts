import mongoose, { Document, Schema } from "mongoose";

export interface IProductVariant {
  size: string;
  color: string;
  colorHex: string;
  stock: number;
  price?: number;
  sku?: string;
}

export interface IProductColor {
  name: string;
  hex: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariant>(
  {
    size: { type: String, required: true },
    color: { type: String, required: true },
    colorHex: { type: String, required: true },
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
  },
  { timestamps: true }
);

export const Product = mongoose.model<IProduct>("Product", productSchema, "product");
