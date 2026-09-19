import mongoose, { Document, Schema } from "mongoose";

/**
 * Categoría gestionable del catálogo (colección `categories`).
 * El panel admin puede listarlas, crear nuevas y eliminar las que no estén
 * en uso. Si la colección queda vacía, el siguiente GET restaura la semilla
 * por defecto (incluida "Otros").
 */
export interface ICategory extends Document {
  name: string;
  /** Clave normalizada (minúsculas, sin acentos) para detectar duplicados. */
  key: string;
  /** Agrupación de la categoría (ej. "Camas", "Sillas"); la usa el filtro del catálogo. */
  group: string;
  /** Posición de la categoría en el listado (menor = primero). */
  order: number;
  /** URL pública de la imagen representativa de la categoría (opcional). */
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // `unique` crea el índice único de MongoDB sobre `key`, garantía a nivel
    // de base de datos contra categorías duplicadas incluso con peticiones
    // concurrentes (el service además traduce el error 11000 a un 409).
    key: { type: String, required: true, unique: true },
    group: { type: String, required: true, trim: true, maxlength: 100 },
    order: { type: Number, default: 0 },
    image: { type: String },
  },
  { timestamps: true }
);

export const Category = mongoose.model<ICategory>("Category", categorySchema, "categories");
