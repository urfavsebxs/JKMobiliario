import { z } from "zod";

// ─── Auth ────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .max(255, "Email too long"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password too long"),
});

// ─── Products ────────────────────────────────────────────────────────
// NOTE: En POST/PUT de producto (multer, multipart/form-data) todos los campos
// del body llegan como strings. Por eso se usa z.coerce para números y se
// aceptan tanto strings JSON como arrays para campos complejos. Los PATCH
// (stock, discount, medidas) reciben JSON vía express.json(), no multipart.

const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const productColorSchema = z.object({
  name: z.string().min(1).max(100),
  hex: z.string().regex(hexRegex, "Invalid hex color"),
});

const productVariantSchema = z.object({
  size: z.string().min(1).max(100),
  // Opcionales: camas y comedores varían por tamaño/asientos, no por color.
  color: z.string().min(1).max(100).optional(),
  colorHex: z.string().regex(hexRegex, "Invalid hex color").optional(),
  stock: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0).optional(),
  sku: z.string().max(50).optional(),
});

/**
 * Accepts an array of items, or a JSON string that parses to an array.
 * The string form covers product POST/PUT (multipart/form-data via multer).
 */
const jsonArrayOrRaw = <T extends z.ZodType>(itemSchema: T) =>
  z.union([
    z.array(itemSchema),
    z.string().transform((str, ctx) => {
      try {
        const parsed = JSON.parse(str);
        if (!Array.isArray(parsed)) {
          ctx.addIssue({ code: "custom", message: "Expected a JSON array" });
          return z.NEVER;
        }
        return parsed;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON array" });
        return z.NEVER;
      }
    }),
  ]);

/**
 * Accepts an object, or a JSON string that parses to an object.
 * The string form covers product POST/PUT (multipart/form-data via multer).
 */
const jsonObjectOrRaw = <T extends z.ZodType>(objectSchema: T) =>
  z.union([
    objectSchema,
    z
      .string()
      .transform((str, ctx) => {
        try {
          const parsed = JSON.parse(str);
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            ctx.addIssue({ code: "custom", message: "Expected a JSON object" });
            return z.NEVER;
          }
          return parsed;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid JSON object" });
          return z.NEVER;
        }
      })
      // El objeto parseado se valida/coerciona con el esquema real.
      .pipe(objectSchema),
  ]);

// ─── Producto: medidas base ──────────────────────────────────────────

/**
 * Medidas reales del modelo GLB en centímetros (ejes opcionales).
 * En POST/PUT de producto (multer) puede llegar como string JSON; en
 * PATCH /:id/medidas llega como objeto plano vía express.json().
 * El mínimo (0.1) debe coincidir con Product.medidasBase para que la
 * validación falle en 400 y no en un ValidationError de Mongoose (500).
 */
export const medidasBaseSchema = jsonObjectOrRaw(
  z.object({
    ancho: z.coerce.number().min(0.1, "La medida mínima es 0.1 cm").max(100000).optional(),
    largo: z.coerce.number().min(0.1, "La medida mínima es 0.1 cm").max(100000).optional(),
    alto: z.coerce.number().min(0.1, "La medida mínima es 0.1 cm").max(100000).optional(),
  })
);

/** Descuento activo en porcentaje (0 = sin descuento). */
export const discountPercentSchema = z.coerce.number().int().min(0).max(100);

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(300),
  description: z.string().min(1, "Description is required").max(2000),
  dimensions: z.string().min(1, "Dimensions are required").max(200),
  price: z.coerce.number().min(0.01, "Price must be positive"),
  stock: z.coerce.number().int().min(0, "Stock cannot be negative"),
  category: z.string().max(100).optional(),
  sizes: jsonArrayOrRaw(z.string()).optional(),
  colors: jsonArrayOrRaw(productColorSchema).optional(),
  variants: jsonArrayOrRaw(productVariantSchema).optional(),
  // El flujo normal usa POST/DELETE /:id/model; se acepta aquí por completitud.
  model3d: z.string().url("model3d must be a valid URL").max(2048).optional(),
  // Medidas reales del modelo GLB en centímetros (referencia de escalado).
  medidasBase: medidasBaseSchema.optional(),
  // Descuento activo en porcentaje (0 = sin descuento).
  discountPercent: discountPercentSchema.optional(),
});

export const updateProductSchema = createProductSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided for update" }
);

export const updateStockSchema = z.object({
  quantity: z.coerce
    .number({ message: "quantity must be a number" })
    .int({ message: "quantity must be an integer" }),
});

/** PATCH /:id/discount — descuento activo en porcentaje (0 = sin descuento). */
export const updateDiscountSchema = z.object({
  discountPercent: discountPercentSchema,
});

/** PATCH /:id/medidas — medidas reales del modelo GLB en centímetros. */
export const updateMedidasSchema = z.object({
  medidasBase: medidasBaseSchema,
});

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format"),
});

export const removeImageQuerySchema = z.object({
  imageUrl: z
    .string()
    .min(1, "imageUrl query parameter is required")
    .url("imageUrl must be a valid URL"),
});

// ─── Categories ──────────────────────────────────────────────────────

/**
 * Centinela del select de categorías del frontend (`ProductForm.tsx`):
 * nunca puede ser una categoría real.
 */
const RESERVED_CATEGORY_NAME = "__nueva__";

/**
 * POST /api/categories body.
 * - `name` rechaza el centinela `__nueva__` que usa el select del frontend.
 * - `group` opcional: "" o "   " se normalizan a undefined y el service cae
 *   al `name`; se recorta y se rechaza por encima de 100 caracteres.
 * - `image` admite cadena vacía (se normaliza a undefined); si viene, debe
 *   ser una URL http(s) de hasta 2048 caracteres.
 */
export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100)
    .refine((v) => v.toLowerCase() !== RESERVED_CATEGORY_NAME, {
      message: "Nombre de categoría reservado",
    }),
  group: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v || undefined)
    .optional(),
  image: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || /^https?:\/\//.test(v), { message: "image must be an http(s) URL" })
    .transform((v) => v || undefined)
    .optional(),
});
