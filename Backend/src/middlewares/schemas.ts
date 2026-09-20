import { z } from "zod";
import { ROLES } from "../models/User";
import { LARGO_MINIMO_PASSWORD } from "../lib/passwords";

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

/**
 * Contraseña que el usuario elige para sí mismo. La política vive aquí y en
 * `lib/passwords.ts` — el login NO la aplica a propósito: revelar los requisitos
 * en la pantalla de entrada solo ayudaría a quien prueba contraseñas.
 */
const newPasswordSchema = z
  .string()
  .min(LARGO_MINIMO_PASSWORD, `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`)
  .max(128, "La contraseña es demasiado larga");

/**
 * POST /api/auth/change-password
 * El usuario cambia su propia contraseña (incluida la temporal del primer
 * login). Se exige la actual: prueba posesión y evita que alguien que encuentre
 * una sesión abierta fije una contraseña nueva.
 */
export const changePasswordSchema = z
  .object({
    passwordActual: z.string().min(1, "La contraseña actual es obligatoria").max(128),
    passwordNueva: newPasswordSchema,
    confirmarPassword: z.string().min(1, "Confirma la contraseña nueva").max(128),
  })
  .refine((data) => data.passwordNueva === data.confirmarPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmarPassword"],
  });

// ─── Usuarios del panel ──────────────────────────────────────────────

/**
 * POST /api/users body.
 * El rol se valida contra la lista real del modelo, no contra un enum duplicado
 * aquí: si mañana se añade un rol, este esquema lo acepta sin tocarse.
 */
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  email: z.string().trim().min(1, "El correo es obligatorio").email("Correo no válido").max(255),
  role: z.enum(ROLES),
});

/** PATCH /api/users/:id/activo body. */
export const updateActivoSchema = z.object({
  activo: z.boolean({ message: "activo debe ser true o false" }),
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
 * Campo `name` de categoría: recortado, no vacío, <=100 y sin el centinela
 * `__nueva__` que usa el select del frontend. Compartido por creación y update.
 */
const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100)
  .refine((v) => v.toLowerCase() !== RESERVED_CATEGORY_NAME, {
    message: "Nombre de categoría reservado",
  });

/**
 * Campo `group`: recortado, <=100; "" o "   " se normalizan a undefined para
 * que el service caiga al `name` (regla idéntica en creación y update).
 */
const categoryGroupSchema = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || undefined);

/**
 * Campo `image`: cadena vacía se normaliza a undefined (quitar imagen); si
 * viene, debe ser una URL http(s) de hasta 2048 caracteres.
 */
const categoryImageSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https?:\/\//.test(v), { message: "image must be an http(s) URL" })
  .transform((v) => v || undefined);

/**
 * POST /api/categories body.
 * - `name` obligatorio con las reglas de `categoryNameSchema`.
 * - `group` e `image` opcionales con sus reglas compartidas.
 */
export const createCategorySchema = z.object({
  name: categoryNameSchema,
  group: categoryGroupSchema.optional(),
  image: categoryImageSchema.optional(),
});

/**
 * PUT /api/categories/:id body.
 * Todos los campos son opcionales, pero debe venir al menos uno.
 *
 * Nota: Zod conserva la clave cuando el cliente la envía (aunque el
 * transform la deje en undefined, p. ej. `{ "group": "" }`), de modo que el
 * service puede distinguir "campo ausente" (no tocar) de "campo vacío"
 * (group -> cae al nombre; image -> se elimina).
 */
export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    group: categoryGroupSchema.optional(),
    image: categoryImageSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

// ─── Comprobantes de pago ────────────────────────────────────────────

/**
 * POST /api/comprobantes/imagen
 * Lo llama n8n antes de mandar el binario; devuelve la `key` que se usa después
 * en el POST de metadatos. Va en el query string porque el cuerpo entero del
 * request es la imagen cruda.
 */
export const comprobanteImagenSchema = z.object({
  telefono: z.string().min(5, "El teléfono es obligatorio").max(40),
  mime: z.string().min(3).max(100).optional(),
});

/**
 * POST /api/comprobantes body (metadatos extraídos por el modelo de visión).
 * Todo es opcional salvo `telefono` e `imagenKey`: el análisis puede fallar
 * parcialmente y aun así interesa registrar el comprobante para revisión.
 * El nivel de alerta NO lo fija el cliente: lo calcula el servicio.
 */
export const createComprobanteSchema = z.object({
  telefono: z.string().min(5, "El teléfono es obligatorio").max(40),
  imagenKey: z.string().min(1, "La key de la imagen es obligatoria").max(500),
  nombreCliente: z.string().max(200).optional(),
  /**
   * Nombre del perfil de WhatsApp. Es el respaldo para saludar al cliente en la
   * plantilla cuando el comprobante es ilegible y `nombreCliente` va vacío:
   * Meta rechaza el envío si un parámetro de la plantilla queda vacío.
   */
  nombrePerfilWhatsApp: z.string().max(200).optional(),
  producto: z.string().max(300).optional(),
  monto: z.coerce.number().min(0).optional(),
  bancoOrigen: z.string().max(100).optional(),
  referenciaPago: z.string().max(200).optional(),
  fechaPago: z.string().max(100).optional(),
  /** JSON crudo del análisis; se guarda tal cual para auditar. */
  datosExtraidos: z.record(z.string(), z.unknown()).optional(),
  /**
   * Señales de manipulación detectadas por el modelo. El servicio las usa
   * para calcular la alerta; no se confía en un nivel de alerta que venga
   * del cliente.
   */
  senalesManipulacion: z.array(z.string().max(300)).max(20).optional(),
  /** Confianza declarada por el modelo (0-1). */
  confianza: z.coerce.number().min(0).max(1).optional(),
});

/**
 * PATCH /api/comprobantes/:id — aprobar o rechazar.
 * `motivoRechazo` es obligatorio al rechazar y debe ser una clave conocida;
 * se valida contra la lista real en el servicio (aquí solo la forma).
 */
export const revisarComprobanteSchema = z
  .object({
    estado: z.enum(["aprobado", "rechazado"]),
    motivoRechazo: z.string().max(50).optional(),
  })
  .refine((data) => data.estado !== "rechazado" || !!data.motivoRechazo, {
    message: "El motivo es obligatorio al rechazar",
    path: ["motivoRechazo"],
  });
