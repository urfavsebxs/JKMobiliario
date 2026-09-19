/**
 * Categorías del catálogo: respaldo local y utilidades compartidas.
 *
 * IMPORTANTE: mantener `CATEGORIAS_POR_DEFECTO` sincronizada con
 * `DEFAULT_CATEGORIES` del backend (Backend/src/modules/categories/category.service.ts).
 * Es la lista que se usa cuando `GET /api/categories` no está disponible.
 */

export interface CategoriaVista {
  _id?: string;
  name: string;
  group: string;
  order?: number;
  image?: string;
}

/**
 * Categorías por defecto (mismos nombres, grupos y orden que el backend).
 * Incluye siempre "Otros" para que el formulario de producto nunca se quede
 * sin una categoría comodín.
 */
export const CATEGORIAS_POR_DEFECTO: CategoriaVista[] = [
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
 * Aplica el respaldo local cuando la lista del backend llega vacía, para que
 * ningún componente se renderice sin categorías.
 */
export function categoriasConRespaldo(categorias: CategoriaVista[]): CategoriaVista[] {
  return categorias.length > 0 ? categorias : CATEGORIAS_POR_DEFECTO;
}

/**
 * Normaliza una categoría para compararla sin depender de mayúsculas, acentos,
 * guiones ni espacios repetidos ("  Sofás_Modernos " -> "sofas modernos").
 */
export function normalizarCategoria(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slug de URL de una categoría: "Sofás Modernos" -> "sofas-modernos". */
export const slugDeCategoria = (texto: string): string =>
  normalizarCategoria(texto).replace(/ /g, "-");

export interface GrupoCategorias {
  titulo: string;
  categorias: CategoriaVista[];
}

/** Orden estable del catálogo: `order` ascendente y, a igualdad, nombre en español. */
export function compararCategorias(a: CategoriaVista, b: CategoriaVista): number {
  const diferencia = (a.order ?? 0) - (b.order ?? 0);
  return diferencia !== 0 ? diferencia : a.name.localeCompare(b.name, "es");
}

/**
 * Agrupa las categorías por su `group` conservando el orden del catálogo:
 * primero se ordena una copia por `order`/nombre y después se agrupa
 * respetando la primera aparición de cada grupo. Un grupo vacío cae al nombre
 * de la categoría para que nunca se pierda su título.
 */
export function agruparCategorias(categorias: CategoriaVista[]): GrupoCategorias[] {
  const ordenadas = [...categorias].sort(compararCategorias);
  const grupos: GrupoCategorias[] = [];
  const indicePorGrupo = new Map<string, number>();

  for (const categoria of ordenadas) {
    const titulo = categoria.group || categoria.name;
    const indice = indicePorGrupo.get(titulo);

    if (indice !== undefined) {
      grupos[indice].categorias.push(categoria);
    } else {
      indicePorGrupo.set(titulo, grupos.length);
      grupos.push({ titulo, categorias: [categoria] });
    }
  }

  return grupos;
}
