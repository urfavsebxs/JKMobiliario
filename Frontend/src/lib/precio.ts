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

/**
 * Normaliza el porcentaje de descuento a un entero entre 0 y 100.
 * Valores ausentes, no numéricos o fuera de rango se tratan como sin descuento.
 */
export function descuentoAplicable(discountPercent?: number): number {
  if (typeof discountPercent !== "number" || !Number.isFinite(discountPercent)) return 0;
  return Math.min(100, Math.max(0, Math.round(discountPercent)));
}

/**
 * Precio final tras aplicar el descuento, redondeado al peso.
 * Sin descuento (o con precio ≤ 0, que se cotiza) devuelve el precio original.
 */
export function precioConDescuento(price: number, discountPercent?: number): number {
  const descuento = descuentoAplicable(discountPercent);
  if (descuento <= 0 || price <= 0) return price;
  return Math.round(price * (1 - descuento / 100));
}
