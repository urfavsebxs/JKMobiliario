import { atom } from "nanostores";

// `MedidasBase` vive en el contrato de tipos del producto; se re-exporta aquí
// porque el visor 3D la importa junto al store.
export type { MedidasBase } from "./types";

export interface MedidasMueble {
  /** Ancho en centímetros. */
  ancho?: number;
  /** Alto en centímetros. */
  alto?: number;
  /** Largo/profundidad en centímetros. */
  profundo?: number;
}

/**
 * Medidas personalizadas que el cliente (o un asesor) define para el mueble.
 * El visor 3D las usa para escalar el modelo en tiempo real.
 */
export const medidasMueble = atom<MedidasMueble | null>(null);

function limpiar(valor?: number): number | undefined {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return undefined;
  return Math.round(valor * 10) / 10;
}

/**
 * Normaliza, poda valores vacíos y evita notificar cuando no hay cambios
 * reales. Es la única vía de escritura para que el formulario de medidas y el
 * visor 3D no entren en un bucle de sincronización.
 */
export function fijarMedidas(medidas: MedidasMueble | null) {
  const siguiente = medidas
    ? {
        ancho: limpiar(medidas.ancho),
        alto: limpiar(medidas.alto),
        profundo: limpiar(medidas.profundo),
      }
    : null;

  const vacio = !siguiente || (!siguiente.ancho && !siguiente.alto && !siguiente.profundo);
  const actual = medidasMueble.get();

  if (vacio) {
    if (actual) medidasMueble.set(null);
    return;
  }

  if (
    actual &&
    actual.ancho === siguiente.ancho &&
    actual.alto === siguiente.alto &&
    actual.profundo === siguiente.profundo
  ) {
    return;
  }

  medidasMueble.set(siguiente);
}
