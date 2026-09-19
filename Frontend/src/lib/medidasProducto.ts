import type { Product } from "./types";

/**
 * Medidas de producto para el filtro del catálogo.
 *
 * Los productos guardan las medidas de formas heterogéneas (`sizes`,
 * `dimensions` y `medidasBase`), así que aquí se normaliza todo a pares
 * (ancho, largo) en centímetros.
 *
 * Reglas de parseo de textos (`sizes` y segmentos de `dimensions`):
 *  1. Solo se acepta el segmento si trae una marca de par de dimensiones: dos
 *     números separados por `x`, `X` o `×`, con o sin unidades
 *     ("1.20 X 1.90", "240cm x 90cm", "15x20 cm").
 *  2. Manda la unidad explícita: "cm" → sin conversión; "m" como unidad
 *     (pegada a un número o suelta, nunca dentro de otra palabra) → ×100; sin
 *     unidad → los valores ≤ 20 se asumen metros (×100) y los > 20 centímetros.
 *  3. Se descartan los segmentos que mencionen "asiento(s)" o "puesto(s)"
 *     aunque contengan números.
 *  4. De cada segmento se toman los dos primeros números (el tercero sería el
 *     alto) y los pares repetidos se deduplican.
 *
 * `medidasBase` ya está en centímetros y se usa tal cual.
 */

export interface MedidaPar {
  ancho: number;
  largo: number;
}

export interface LimitesMedidas {
  anchoMin?: number | null;
  anchoMax?: number | null;
  largoMin?: number | null;
  largoMax?: number | null;
}

/** Campos del producto que participan en el filtro de medidas. */
type ProductoMedible = Pick<Product, "sizes" | "dimensions" | "medidasBase">;

/** Número con decimal opcional (punto o coma). */
const NUMERO = String.raw`\d+(?:[.,]\d+)?`;
/** Par de dimensiones: dos números unidos por "x", "X" o "×", con unidades opcionales. */
const PAR_DIMENSIONES = new RegExp(`(${NUMERO})\\s*(?:cm|m)?\\s*[x×]\\s*(${NUMERO})`, "i");
/** Segmentos que hablan de capacidad/plazas, no de medidas. */
const SIN_MEDIDAS = /asientos?|puestos?/i;

function numeroDeTexto(texto: string): number {
  return Number(texto.replace(",", "."));
}

/** Unidad declarada en el segmento, si la hay. "cm" tiene prioridad sobre "m". */
function unidadDeSegmento(texto: string): "cm" | "m" | null {
  if (/cm/i.test(texto)) return "cm";

  // "m" como unidad: pegada a un número ("1.20m", "200 m"), nunca formando
  // parte de otra palabra ("metros", "muebles", "meses").
  if (/\d\s*m(?!\p{L})/iu.test(texto)) return "m";

  return null;
}

/** Convierte un valor a centímetros según la unidad detectada. */
function aCentimetros(valor: number, unidad: "cm" | "m" | null): number {
  if (unidad === "cm") return valor;
  if (unidad === "m") return valor * 100;
  return valor > 0 && valor <= 20 ? valor * 100 : valor;
}

/**
 * Extrae el par (ancho, largo) de un texto con marca "x"/"×". Devuelve `null`
 * si el segmento no describe dimensiones.
 */
function parDeSegmento(segmento: string): MedidaPar | null {
  if (SIN_MEDIDAS.test(segmento)) return null;

  const coincidencia = PAR_DIMENSIONES.exec(segmento);
  if (!coincidencia) return null;

  const unidad = unidadDeSegmento(segmento);
  return {
    ancho: aCentimetros(numeroDeTexto(coincidencia[1]), unidad),
    largo: aCentimetros(numeroDeTexto(coincidencia[2]), unidad),
  };
}

/**
 * Extrae todos los pares (ancho, largo) en centímetros de un producto:
 *  1. `sizes`: cada string con marca de par ("1.20 X 1.90") aporta un par.
 *  2. `dimensions`: se divide por "·", "|", ";" o saltos de línea y cada
 *     segmento válido aporta un par.
 *  3. `medidasBase`: { ancho, largo } ya está en cm (no se convierte).
 *
 * Los pares repetidos se descartan.
 */
export function medidasDeProducto(producto: ProductoMedible): MedidaPar[] {
  const pares: MedidaPar[] = [];
  const vistos = new Set<string>();

  const agregar = (par: MedidaPar | null) => {
    if (!par) return;
    const clave = `${par.ancho}x${par.largo}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    pares.push(par);
  };

  for (const medida of producto.sizes ?? []) {
    agregar(parDeSegmento(medida));
  }

  for (const segmento of (producto.dimensions ?? "").split(/[·|;\n\r]+/)) {
    agregar(parDeSegmento(segmento));
  }

  const { ancho, largo } = producto.medidasBase ?? {};
  if (typeof ancho === "number" && typeof largo === "number" && ancho > 0 && largo > 0) {
    agregar({ ancho, largo });
  }

  return pares;
}

/**
 * Normaliza los límites informados: descarta valores negativos o no finitos
 * (los trata como ausentes) y, si un mínimo supera a su máximo, los
 * intercambia para que el rango invertido no vacíe la lista.
 */
export function normalizarLimitesMedidas(limites: LimitesMedidas): LimitesMedidas {
  const limpiar = (valor: number | null | undefined): number | null =>
    typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;

  let anchoMin = limpiar(limites.anchoMin);
  let anchoMax = limpiar(limites.anchoMax);
  let largoMin = limpiar(limites.largoMin);
  let largoMax = limpiar(limites.largoMax);

  if (anchoMin != null && anchoMax != null && anchoMin > anchoMax) {
    [anchoMin, anchoMax] = [anchoMax, anchoMin];
  }
  if (largoMin != null && largoMax != null && largoMin > largoMax) {
    [largoMin, largoMax] = [largoMax, largoMin];
  }

  return { anchoMin, anchoMax, largoMin, largoMax };
}

/** true cuando hay al menos un límite informado y válido. */
export function tieneLimitesMedidas(limites: LimitesMedidas): boolean {
  const normalizados = normalizarLimitesMedidas(limites);

  return (
    normalizados.anchoMin != null ||
    normalizados.anchoMax != null ||
    normalizados.largoMin != null ||
    normalizados.largoMax != null
  );
}

/**
 * Un producto pasa el filtro si ALGÚN par (ancho, largo) cumple a la vez todos
 * los límites informados. Los límites vacíos, negativos o invertidos se
 * normalizan antes; un producto sin pares medibles se excluye cuando hay algún
 * límite.
 */
export function cumpleMedidas(producto: ProductoMedible, limites: LimitesMedidas): boolean {
  const normalizados = normalizarLimitesMedidas(limites);
  if (!tieneLimitesMedidas(normalizados)) return true;

  return medidasDeProducto(producto).some(
    ({ ancho, largo }) =>
      (normalizados.anchoMin == null || ancho >= normalizados.anchoMin) &&
      (normalizados.anchoMax == null || ancho <= normalizados.anchoMax) &&
      (normalizados.largoMin == null || largo >= normalizados.largoMin) &&
      (normalizados.largoMax == null || largo <= normalizados.largoMax)
  );
}

/** Convierte un parámetro de URL a número; vacío o inválido → null. */
export function numeroDeParametro(valor: string | null | undefined): number | null {
  const texto = (valor ?? "").trim().replace(",", ".");
  if (texto === "") return null;

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}
