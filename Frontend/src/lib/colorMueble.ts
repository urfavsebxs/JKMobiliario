import { atom } from "nanostores";

export interface ColorMueble {
  nombre: string;
  hex: string;
}

/**
 * Color de acabado que el cliente elige para su mueble.
 *
 * Lo comparten el selector de colores del producto y el visor 3D: cualquiera
 * de los dos escribe y ambos se mantienen sincronizados. `null` representa el
 * acabado original del modelo.
 */
export const colorMueble = atom<ColorMueble | null>(null);

export function setColorMueble(color: ColorMueble | null) {
  colorMueble.set(color);
}
