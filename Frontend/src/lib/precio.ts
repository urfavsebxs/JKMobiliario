/**
 * Formato de precios en pesos colombianos (COP).
 *
 * En Colombia el peso se maneja sin centavos y con punto como separador de
 * miles: `$ 899.990`. Todo el frontend debe formatear con este helper para no
 * repetir configuraciones de `Intl` que se desincronizan.
 */
const formateadorCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatPrice(price: number): string {
  return formateadorCOP.format(Math.round(price || 0));
}

/** Precio de catálogo: un valor ≤ 0 se muestra como "Cotización". */
export function precioTexto(price: number): string {
  return price > 0 ? formatPrice(price) : "Cotización";
}
