import { Category, ICategory } from "../../models/Category";
import { Product } from "../../models/Product";
import { AppError } from "../../middlewares/errorHandler";

interface CreateCategoryDTO {
  name: string;
  group?: string;
  image?: string;
}

interface UpdateCategoryDTO {
  name?: string;
  group?: string;
  image?: string;
}

interface DefaultCategory {
  name: string;
  group: string;
  order: number;
  key: string;
}

/**
 * Centinela del select de categorías del frontend
 * (`Frontend/src/components/react/ProductForm.tsx`); nunca puede ser una
 * categoría real.
 */
const RESERVED_CATEGORY_NAME = "__nueva__";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/**
 * Normaliza un nombre de categoría para usarlo como clave única (`key`).
 *
 * Criterio IDÉNTICO al frontend (`Frontend/src/lib/categorias.ts`,
 * `normalizarCategoria`); cualquier cambio aquí debe replicarse allí y
 * viceversa:
 *  1. toLowerCase
 *  2. normalize("NFD") y eliminación de diacríticos (/[\u0300-\u036f]/g)
 *  3. conversión de guiones y guiones bajos a espacio (/[-_]+/g)
 *  4. colapso de espacios múltiples a uno solo
 *  5. trim final
 *
 * Ejemplo: "  Sofás_Modernos " -> "sofas modernos"; "Sofás-Modernos" produce
 * la misma key, por lo que no se generan duplicados.
 */
export const normalizarNombre = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Semilla de categorías por defecto (la `key` se deriva con `normalizarNombre`). */
const defaultCategorySeed: ReadonlyArray<Pick<DefaultCategory, "name" | "group" | "order">> = [
  { name: "Camas Minimalistas", group: "Camas", order: 1 },
  { name: "Camas Modernas", group: "Camas", order: 2 },
  { name: "Comedores", group: "Comedores", order: 3 },
  { name: "Mesas de Centro", group: "Mesas", order: 4 },
  { name: "Mesas de Noche", group: "Mesas", order: 5 },
  { name: "Sillas de Barra", group: "Sillas", order: 6 },
  { name: "Sillas Minimalistas", group: "Sillas", order: 7 },
  { name: "Sillas Modernas", group: "Sillas", order: 8 },
  { name: "Sofás Minimalistas", group: "Sofás", order: 9 },
  { name: "Sofás Modernos", group: "Sofás", order: 10 },
  { name: "Otros", group: "Otros", order: 11 },
];

/**
 * Categorías por defecto con su `key` normalizada. La semilla incluye "Otros"
 * y se vuelve a aplicar si la colección queda vacía (ver `listCategories`).
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = defaultCategorySeed.map((category) => ({
  ...category,
  key: normalizarNombre(category.name),
}));

/** Error de escritura individual de un `bulkWrite` (driver de MongoDB). */
interface BulkWriteErrorEntry {
  code?: number;
  err?: { code?: number };
}

const isDuplicateKeyWriteError = (entry: BulkWriteErrorEntry): boolean =>
  entry.code === 11000 || entry.err?.code === 11000;

/**
 * Comprueba si un error de `bulkWrite` contiene únicamente claves duplicadas.
 * Con `{ ordered: false }` los fallos no abortan el lote y se acumulan en
 * `error.writeErrors` (BulkWriteError), no como un throw con `code === 11000`.
 */
const isDuplicateKeyBulkWriteError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const writeErrors = (error as { writeErrors?: unknown }).writeErrors;
  return (
    Array.isArray(writeErrors) &&
    writeErrors.length > 0 &&
    writeErrors.every((entry) => isDuplicateKeyWriteError(entry as BulkWriteErrorEntry))
  );
};

/**
 * Siembra idempotente de las categorías por defecto.
 *
 * - `upsert` + `$setOnInsert` no sobrescribe ediciones futuras del admin:
 *   solo inserta las que falten.
 * - `{ ordered: false }` intenta TODAS las operaciones aunque alguna falle.
 *   Si dos peticiones concurrentes siembran con la colección vacía, la que
 *   pierde acumula claves duplicadas (11000) en `writeErrors` y aun así
 *   completa el resto de upserts, evitando una semilla parcial permanente.
 *   Esa carrera es esperada (el upsert por `key` es idempotente) y se ignora;
 *   cualquier otro error se propaga.
 */
const seedDefaultCategories = async (): Promise<void> => {
  try {
    await Category.bulkWrite(
      DEFAULT_CATEGORIES.map((category) => ({
        updateOne: {
          filter: { key: category.key },
          update: {
            $setOnInsert: {
              name: category.name,
              key: category.key,
              group: category.group,
              order: category.order,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    if (!isDuplicateKeyBulkWriteError(error)) {
      throw error;
    }
  }
};

/**
 * Lista las categorías ordenadas por `order` ascendente y luego por nombre.
 *
 * Comprueba el conteo en cada GET (barato): si el admin borró todas las
 * categorías, la siguiente petición restaura la semilla por defecto
 * (incluida "Otros") para que la home nunca quede sin datos. Antes de sembrar
 * se asegura el índice único de `key` para evitar duplicados si llegan
 * peticiones concurrentes con la colección vacía; si la siembra choca con una
 * clave duplicada (otro request la hizo a la vez), se ignora sin romper la
 * respuesta. La proyección respeta el contrato: `name`, `group`, `order`,
 * `image` y `_id`, sin exponer `key`, `__v` ni timestamps.
 */
export const listCategories = async (): Promise<ICategory[]> => {
  const total = await Category.estimatedDocumentCount();

  if (total === 0) {
    // Asegura el índice único antes de sembrar; si su creación falla se
    // registra y se continúa (el upsert por `key` sigue siendo idempotente).
    await Category.init().catch((error: unknown) => {
      console.error(
        "[categories] No se pudo asegurar el índice único de key:",
        error instanceof Error ? error.message : error
      );
    });

    try {
      await seedDefaultCategories();
    } catch (error) {
      // Respaldo: si el driver lanza un 11000 plano (sin `writeErrors`) por
      // otra petición que sembró a la vez, se ignora sin romper el GET.
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  return Category.find().select("name group order image").sort({ order: 1, name: 1 });
};

/**
 * Crea una categoría nueva.
 * - `group` vacío/ausente se completa con el propio `name`.
 * - `key` se deriva normalizando el nombre; si ya existe => 409.
 * - `order` = máximo existente + 1.
 */
export const createCategory = async (data: CreateCategoryDTO): Promise<ICategory> => {
  const name = data.name.trim();
  if (!name) {
    throw createAppError("El nombre es obligatorio", 400);
  }
  // Defensa en profundidad: el schema Zod ya rechaza este valor con 400.
  if (name.toLowerCase() === RESERVED_CATEGORY_NAME) {
    throw createAppError("Nombre de categoría reservado", 400);
  }

  const group = data.group?.trim() || name;
  const key = normalizarNombre(name);

  const existing = await Category.findOne({ key }).lean();
  if (existing) {
    throw createAppError("Ya existe una categoría con ese nombre", 409);
  }

  const last = await Category.findOne().sort({ order: -1 }).select({ order: 1 }).lean();
  const order = (last?.order ?? 0) + 1;

  try {
    return await Category.create({
      name,
      key,
      group,
      order,
      image: data.image,
    });
  } catch (error) {
    // Traduce la violación del índice único (peticiones concurrentes) al 409.
    if (isDuplicateKeyError(error)) {
      throw createAppError("Ya existe una categoría con ese nombre", 409);
    }
    throw error;
  }
};

/**
 * Actualiza una categoría existente (nombre, grupo e imagen).
 *
 * - `name`: si cambia, recalcula la `key` normalizada; si otra categoría ya
 *   usa esa key => 409. Además sincroniza en cascada TODOS los productos que
 *   usaban el nombre anterior (comparación normalizada) y devuelve cuántos
 *   se actualizaron.
 * - `group`: si el campo viene vacío/espacios cae al nombre resultante;
 *   si está ausente, conserva el grupo actual.
 * - `image`: si el campo viene vacío ("") se elimina; si está ausente, se
 *   conserva. (El schema conserva la clave aunque su valor quede undefined.)
 */
export const updateCategory = async (
  id: string,
  data: UpdateCategoryDTO
): Promise<{ categoria: ICategory; productosActualizados: number }> => {
  const category = await Category.findById(id);
  if (!category) {
    throw createAppError("Categoría no encontrada", 404);
  }

  const hasGroup = Object.prototype.hasOwnProperty.call(data, "group");
  const hasImage = Object.prototype.hasOwnProperty.call(data, "image");
  const nombreAnterior = category.name;
  const nuevoNombre = data.name?.trim();

  if (nuevoNombre !== undefined) {
    if (!nuevoNombre) {
      throw createAppError("El nombre es obligatorio", 400);
    }
    // Defensa en profundidad: el schema Zod ya rechaza este valor con 400.
    if (nuevoNombre.toLowerCase() === RESERVED_CATEGORY_NAME) {
      throw createAppError("Nombre de categoría reservado", 400);
    }

    const nuevaKey = normalizarNombre(nuevoNombre);
    // Colisión con otra categoría (excluyéndose a sí misma) => 409 controlado.
    const existente = await Category.findOne({
      key: nuevaKey,
      _id: { $ne: category._id },
    }).lean();
    if (existente) {
      throw createAppError("Ya existe una categoría con ese nombre", 409);
    }

    category.name = nuevoNombre;
    category.key = nuevaKey;
  }

  const nombreFinal = category.name;

  // `group` presente y vacío cae al nombre resultante.
  if (hasGroup) {
    category.group = data.group?.trim() || nombreFinal;
  }

  // `image` presente y vacía elimina la imagen (Mongoose hace $unset al
  // guardar un path asignado a undefined). El schema Zod ya normaliza "" a
  // undefined; se repite aquí para tolerar llamadas directas al service.
  if (hasImage) {
    category.image = data.image?.trim() || undefined;
  }

  try {
    await category.save();
  } catch (error) {
    // Violación del índice único por una creación concurrente con la misma key.
    if (isDuplicateKeyError(error)) {
      throw createAppError("Ya existe una categoría con ese nombre", 409);
    }
    throw error;
  }

  // Cascada de productos: se ejecuta después de persistir la categoría para
  // no reescribir productos si el guardado falla (p. ej. 409 por carrera).
  // El nombre anterior se normaliza para cubrir variantes ("Sofas Modernos"
  // o "sofas-modernos" cuando la categoría era "Sofás Modernos").
  let productosActualizados = 0;
  if (nuevoNombre !== undefined && nuevoNombre !== nombreAnterior) {
    const variantes = await variantesDeCategoria(nombreAnterior);
    if (variantes.length > 0) {
      const resultado = await Product.updateMany(
        { category: { $in: variantes } },
        { $set: { category: nombreFinal } }
      );
      productosActualizados = resultado.modifiedCount;
    }
  }

  return { categoria: category, productosActualizados };
};

/**
 * Devuelve los valores reales de `Product.category` que coinciden con
 * `nombre` al normalizar (sin acentos, mayúsculas, guiones ni espacios de
 * más). `category` es un string libre en Product (default "general").
 */
const variantesDeCategoria = async (nombre: string): Promise<string[]> => {
  const normalizada = normalizarNombre(nombre);
  return (await Product.distinct("category")).filter(
    (valor): valor is string =>
      typeof valor === "string" && normalizarNombre(valor) === normalizada
  );
};

/**
 * Elimina una categoría por id.
 * - No existe => 404.
 * - Hay productos que la usan (comparación normalizada) => 409.
 * - En caso contrario, elimina y devuelve el nombre.
 */
export const deleteCategory = async (id: string): Promise<string> => {
  const category = await Category.findById(id);
  if (!category) {
    throw createAppError("Categoría no encontrada", 404);
  }

  const variantes = await variantesDeCategoria(category.name);
  const productsInUse =
    variantes.length > 0 ? await Product.countDocuments({ category: { $in: variantes } }) : 0;

  if (productsInUse > 0) {
    throw createAppError(
      `No se puede eliminar "${category.name}": ${productsInUse} producto(s) la usan`,
      409
    );
  }

  await category.deleteOne();
  return category.name;
};

/** Detecta el error de clave duplicada de MongoDB (código 11000). */
const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === 11000;
