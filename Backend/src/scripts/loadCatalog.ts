/**
 * loadCatalog — Carga el catálogo real (Backend/catalog/products.json) en la API
 * viva, de forma idempotente y sin borrar nada.
 *
 * Uso:
 *   pnpm catalog:load -- --images /tmp/opencode/catalog-images
 *   pnpm catalog:load -- --images DIR --dry-run
 *   pnpm catalog:load -- --images DIR --only sofas-modernos,camas-modernas
 *   pnpm catalog:load -- --images DIR --models /tmp/opencode/3d --update
 *
 * Flags:
 *   --images <dir>   Obligatorio. Directorio raíz de las imágenes del manifiesto
 *                    (los paths del manifiesto son relativos a él).
 *   --models <dir>   Opcional. Directorio raíz de los .glb (paths de modelFile).
 *   --update         Si el producto ya existe (name+category), actualiza sus
 *                    campos base con PUT (no toca imágenes ni modelos).
 *   --dry-run        No escribe nada; muestra el plan.
 *   --only <slugs>   Carga solo los catálogos indicados (slug o id completo).
 *
 * Seguridad operativa:
 *   - No existe ninguna llamada DELETE en este script.
 *   - Solo actúa sobre las entradas del manifiesto (144 productos del catálogo).
 *   - La fase de modelos solo corre con --models y exige modelFile + medidasBase.
 *   - `medidasBase` se fija con PATCH /:id/medidas (API viva, validado por Zod);
 *     el script ya no abre conexión directa a Mongo.
 *   - El matching catálogo↔API normaliza nombre y categoría (minúsculas, sin
 *     acentos) y reconoce el alias legacy de "Comedores" para que --update
 *     migre las categorías renombradas sin crear duplicados.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

// ─── Tipos del manifiesto ────────────────────────────────────────────────────

interface ManifestVariant {
  size: string;
  price?: number;
  stock: number;
  color?: string;
  colorHex?: string;
  sku?: string;
}

interface MedidasBase {
  ancho?: number;
  largo?: number;
  alto?: number;
}

interface ManifestProduct {
  id: string;
  name: string;
  category: string;
  linea: string;
  description: string;
  dimensions: string;
  price: number;
  stock: number;
  sizes: string[];
  colors: unknown[];
  variants: ManifestVariant[];
  notes: string[];
  image: string;
  pdf: string;
  page: number;
  modelFile: string | null;
  medidasBase: MedidasBase | null;
}

interface Manifest {
  schemaVersion: number;
  totalProducts: number;
  warnings: string[];
  collisions: string[];
  products: ManifestProduct[];
}

interface ApiProduct {
  _id: string;
  name: string;
  category?: string;
  images?: string[];
  model3d?: string;
}

interface ApiListResponse {
  success: boolean;
  data: { products: ApiProduct[]; total: number };
}

interface ApiItemResponse {
  success: boolean;
  data: ApiProduct;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

const flagValue = (name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => argv.includes(name);

// Por defecto, loopback y en claro: este script se ejecuta EN el servidor que
// hospeda el backend, así que no necesita salir a Internet ni pasar por Caddy.
// Antes el valor por defecto era la IP pública con el puerto, que viajaba en
// claro por la red; contra el servidor real se sigue apuntando con API_BASE_URL
// (p. ej. API_BASE_URL=https://api.jkmobiliario.digital).
const API_BASE_URL = (process.env.API_BASE_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const MANIFEST_PATH = path.resolve(__dirname, "../../catalog/products.json");
const MAX_RETRIES = 2;          // 2 reintentos => hasta 3 intentos por request
const BACKOFF_MS = 400;
const CONCURRENCY = 2;          // baja: MinIO se satura con más concurrencia

const imagesDir = flagValue("--images");
const modelsDir = flagValue("--models");
const onlySlugs = flagValue("--only")?.split(",").map((slug) => slug.trim()).filter(Boolean) ?? [];
const updateExisting = hasFlag("--update");
const dryRun = hasFlag("--dry-run");

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ─── HTTP con reintentos ─────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new HttpError(
          `${label}: HTTP ${response.status} ${body.slice(0, 300)}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_RETRIES) {
        await sleep(BACKOFF_MS * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function login(): Promise<string> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno (.env)");
  }

  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    "login",
  );
  const body = (await response.json()) as { success: boolean; data?: { token?: string } };
  if (!body.success || !body.data?.token) {
    throw new Error("Login sin token en la respuesta");
  }
  return body.data.token;
}

const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

async function listExistingProducts(token: string): Promise<ApiProduct[]> {
  const products: ApiProduct[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (products.length < total) {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/api/products?page=${page}&limit=100`,
      { headers: authHeaders(token) },
      `GET /api/products page=${page}`,
    );
    const body = (await response.json()) as ApiListResponse;
    total = body.data.total;
    products.push(...body.data.products);
    if (body.data.products.length === 0) break;
    page += 1;
  }
  return products;
}

// ─── Operaciones contra la API ───────────────────────────────────────────────

/**
 * Clave de identidad catálogo↔API: nombre + categoría normalizados
 * (minúsculas y sin acentos). Normalizar permite que `--update` migre
 * categorías renombradas (p. ej. "Sofás Minimalistas" ← "sofas minimalistas")
 * sin crear duplicados; el alias legacy cubre renombres que no son solo un
 * cambio de mayúsculas/acentos (p. ej. "Comedores" ← "mesas de comedor").
 */
const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  Comedores: "mesas de comedor",
};

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const productKey = (name: string, category?: string): string =>
  `${fold(name)}\u0000${fold(category ?? "")}`;

/** Claves candidatas de búsqueda: categoría del manifiesto y su alias legacy. */
const lookupKeys = (name: string, category?: string): string[] => {
  const keys = [productKey(name, category)];
  const legacy = category ? LEGACY_CATEGORY_ALIASES[category] : undefined;
  if (legacy) keys.push(productKey(name, legacy));
  return keys;
};

const baseFields = (entry: ManifestProduct): Record<string, unknown> => ({
  name: entry.name,
  description: entry.description,
  dimensions: entry.dimensions,
  price: entry.price,
  stock: entry.stock,
  category: entry.category,
  sizes: entry.sizes,
  colors: entry.colors,
  variants: entry.variants,
});

async function createProduct(
  token: string,
  entry: ManifestProduct,
  imageAbsolutePath: string,
): Promise<ApiProduct> {
  const form = new FormData();
  // En multipart todos los campos viajan como strings; Zod coacciona price/stock
  // y acepta sizes/colors/variants como JSON string.
  form.append("name", entry.name);
  form.append("description", entry.description);
  form.append("dimensions", entry.dimensions);
  form.append("price", String(entry.price));
  form.append("stock", String(entry.stock));
  form.append("category", entry.category);
  form.append("sizes", JSON.stringify(entry.sizes));
  form.append("colors", JSON.stringify(entry.colors));
  form.append("variants", JSON.stringify(entry.variants));

  const buffer = await fs.readFile(imageAbsolutePath);
  form.append("images", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), path.basename(imageAbsolutePath));

  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/products`,
    { method: "POST", headers: authHeaders(token), body: form },
    `POST /api/products ${entry.id}`,
  );
  const body = (await response.json()) as ApiItemResponse;
  if (!body.success || !body.data?._id) {
    throw new Error(`Respuesta sin producto creado para ${entry.id}`);
  }
  return body.data;
}

async function updateProduct(
  token: string,
  productId: string,
  entry: ManifestProduct,
): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/products/${productId}`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(baseFields(entry)),
    },
    `PUT /api/products/${productId} ${entry.id}`,
  );
  await response.json();
}

async function uploadModel(
  token: string,
  productId: string,
  modelAbsolutePath: string,
): Promise<ApiProduct> {
  const buffer = await fs.readFile(modelAbsolutePath);
  const form = new FormData();
  form.append(
    "model",
    new Blob([new Uint8Array(buffer)], { type: "model/gltf-binary" }),
    path.basename(modelAbsolutePath),
  );

  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/products/${productId}/model`,
    { method: "POST", headers: authHeaders(token), body: form },
    `POST /api/products/${productId}/model ${path.basename(modelAbsolutePath)}`,
  );
  const body = (await response.json()) as ApiItemResponse;
  if (!body.success) throw new Error(`Modelo rechazado para ${productId}`);
  return body.data;
}

/**
 * Fija medidasBase vía PATCH /:id/medidas (desplegado en vivo).
 * La API fusiona los ejes enviados y valida con Zod; sin acceso directo a Mongo.
 */
async function setMedidasBase(
  token: string,
  productId: string,
  medidas: MedidasBase,
): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/products/${productId}/medidas`,
    {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ medidasBase: medidas }),
    },
    `PATCH /api/products/${productId}/medidas`,
  );
  await response.json();
}

// ─── Pool de concurrencia ────────────────────────────────────────────────────

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift() as T;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface Failure {
  id: string;
  name: string;
  reason: string;
}

async function main(): Promise<number> {
  if (!imagesDir) {
    console.error("ERROR: --images <dir> es obligatorio (directorio de imágenes del manifiesto).");
    return 1;
  }
  const imagesRoot = path.resolve(imagesDir);
  const modelsRoot = modelsDir ? path.resolve(modelsDir) : undefined;

  const manifestRaw = await fs.readFile(MANIFEST_PATH, "utf-8");
  const manifest = JSON.parse(manifestRaw) as Manifest;

  let entries = manifest.products;
  if (onlySlugs.length > 0) {
    entries = entries.filter((entry) =>
      onlySlugs.some((slug) => entry.id === slug || entry.id.startsWith(`${slug}-`)),
    );
    if (entries.length === 0) {
      console.error(`ERROR: --only ${onlySlugs.join(",")} no coincide con ninguna entrada.`);
      return 1;
    }
  }

  console.log(`API: ${API_BASE_URL}`);
  console.log(`Manifiesto: ${MANIFEST_PATH} (${entries.length} entradas a procesar)`);
  console.log(`Imágenes: ${imagesRoot}`);
  if (modelsRoot) console.log(`Modelos: ${modelsRoot}`);
  console.log(`Modo: ${dryRun ? "DRY-RUN" : "ESCRITURA"}${updateExisting ? " + update" : ""}`);

  // Pre-validación de imágenes locales (evita crear productos sin imagen).
  const missingImages = entries
    .map((entry) => path.join(imagesRoot, entry.image))
    .filter((absolute) => !existsSync(absolute));
  if (missingImages.length > 0) {
    console.error(`ERROR: faltan ${missingImages.length} imágenes locales:`);
    for (const file of missingImages.slice(0, 10)) console.error(`  - ${file}`);
    return 1;
  }

  const token = await login();
  const existing = await listExistingProducts(token);
  const existingByKey = new Map<string, ApiProduct>();
  for (const product of existing) {
    existingByKey.set(productKey(product.name, product.category), product);
  }
  console.log(`Productos existentes en la API: ${existing.length}`);

  const created: ManifestProduct[] = [];
  const updated: ManifestProduct[] = [];
  const skipped: ManifestProduct[] = [];
  const failed: Failure[] = [];
  const idByEntry = new Map<string, string>();
  const imageUrlByEntry = new Map<string, string>();
  let processed = 0;

  await runPool(entries, CONCURRENCY, async (entry) => {
    const key = productKey(entry.name, entry.category);
    const match = lookupKeys(entry.name, entry.category)
      .map((candidate) => existingByKey.get(candidate))
      .find((product): product is ApiProduct => Boolean(product));
    try {
      if (!match) {
        if (dryRun) {
          created.push(entry);
        } else {
          const product = await createProduct(token, entry, path.join(imagesRoot, entry.image));
          created.push(entry);
          idByEntry.set(entry.id, product._id);
          if (product.images?.[0]) imageUrlByEntry.set(entry.id, product.images[0]);
          existingByKey.set(key, product); // evita duplicados si el manifiesto repite clave
        }
      } else if (updateExisting) {
        if (dryRun) {
          updated.push(entry);
        } else {
          await updateProduct(token, match._id, entry);
          updated.push(entry);
          idByEntry.set(entry.id, match._id);
        }
      } else {
        skipped.push(entry);
        idByEntry.set(entry.id, match._id);
      }
    } catch (error) {
      failed.push({
        id: entry.id,
        name: entry.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      processed += 1;
      if (processed % 10 === 0 || processed === entries.length) {
        console.log(`  progreso: ${processed}/${entries.length}`);
      }
    }
  });

  // ─── Fase de modelos (solo con --models; no corre en dry-run) ─────────────
  if (modelsRoot && !dryRun) {
    const modelEntries = entries.filter(
      (entry) => entry.modelFile && entry.medidasBase && idByEntry.has(entry.id),
    );
    if (modelEntries.length > 0) {
      console.log(`\nFase de modelos: ${modelEntries.length} entradas con modelFile + medidasBase`);
      await runPool(modelEntries, CONCURRENCY, async (entry) => {
        const productId = idByEntry.get(entry.id) as string;
        try {
          const modelAbsolute = path.join(modelsRoot, entry.modelFile as string);
          await fs.access(modelAbsolute);
          const product = await uploadModel(token, productId, modelAbsolute);
          // Idempotente: si ya tenía modelo, la API reemplaza el objeto anterior.
          if (entry.medidasBase) {
            await setMedidasBase(token, product._id, entry.medidasBase);
          }
          console.log(`  modelo OK: ${entry.id} -> ${product.model3d ?? "(sin url)"}`);
        } catch (error) {
          failed.push({
            id: entry.id,
            name: entry.name,
            reason: `modelo: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      });
    } else {
      console.log("\nFase de modelos: ninguna entrada tiene modelFile + medidasBase (fase 3D pendiente).");
    }
  }

  // ─── Resumen ──────────────────────────────────────────────────────────────
  const totalResponse = await fetchWithRetry(
    `${API_BASE_URL}/api/products?page=1&limit=1`,
    { headers: authHeaders(token) },
    "GET total",
  );
  const totalBody = (await totalResponse.json()) as ApiListResponse;

  console.log("\n════════════════════ RESUMEN ════════════════════");
  console.log(`Creados:      ${created.length}`);
  console.log(`Actualizados: ${updated.length}`);
  console.log(`Saltados:     ${skipped.length}`);
  console.log(`Fallidos:     ${failed.length}`);
  console.log(`Total en API: ${totalBody.data.total}`);

  if (failed.length > 0) {
    console.log("\nFallidos (nombre + motivo):");
    for (const failure of failed) {
      console.log(`  - ${failure.id} | ${failure.name} | ${failure.reason}`);
    }
  }

  if (!dryRun) {
    console.log("\nEjemplos creados:");
    for (const entry of created.slice(0, 6)) {
      console.log(`  - ${entry.id} | ${entry.name} | ${imageUrlByEntry.get(entry.id) ?? "(sin imagen)"}`);
    }
  }

  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("ERROR FATAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
