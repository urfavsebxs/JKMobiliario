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
// NOTE: When using multer (multipart/form-data), all body fields arrive
// as strings. We use z.coerce for numbers and accept both JSON strings
// and arrays for complex fields.

const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const productColorSchema = z.object({
  name: z.string().min(1).max(100),
  hex: z.string().regex(hexRegex, "Invalid hex color"),
});

const productVariantSchema = z.object({
  size: z.string().min(1).max(100),
  color: z.string().min(1).max(100),
  colorHex: z.string().regex(hexRegex, "Invalid hex color"),
  stock: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0).optional(),
  sku: z.string().max(50).optional(),
});

/**
 * Accepts an array of items, or a JSON string that parses to an array.
 * This handles both JSON body and multipart form-data.
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

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format"),
});

export const removeImageQuerySchema = z.object({
  imageUrl: z
    .string()
    .min(1, "imageUrl query parameter is required")
    .url("imageUrl must be a valid URL"),
});
