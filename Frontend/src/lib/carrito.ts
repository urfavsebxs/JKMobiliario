import { atom, computed } from "nanostores";
import { formatPrice } from "./precio";

/**
 * Carrito de compras client-side (sin backend).
 *
 * El estado vive en un `atom` de nanostores y se persiste en localStorage. La
 * lectura de `localStorage` ocurre solo desde `cargarCarrito()`, que el widget
 * llama tras montar, para no romper el SSR ni provocar desajustes de
 * hidratación.
 */

export interface ItemCarrito {
  id: string;
  productId: string;
  nombre: string;
  categoria: string;
  medida?: string;
  color?: string;
  colorHex?: string;
  precio?: number;
  cantidad: number;
  imagen?: string;
}

/** Datos necesarios para agregar; `id` y `cantidad` los resuelve el store. */
export type NuevoItemCarrito = Omit<ItemCarrito, "id" | "cantidad"> & {
  cantidad?: number;
};

const CLAVE_ALMACEN = "jk:carrito:v1";

export const carrito = atom<ItemCarrito[]>([]);

/** Un precio solo cuenta si es un número positivo (0 o ausente = "Cotización"). */
function tienePrecio(item: ItemCarrito): boolean {
  return typeof item.precio === "number" && Number.isFinite(item.precio) && item.precio > 0;
}

export const totalItems = computed(carrito, (items) =>
  items.reduce((total, item) => total + item.cantidad, 0)
);

export const totalPrecio = computed(carrito, (items) =>
  items.reduce(
    (total, item) => total + (tienePrecio(item) ? item.precio! * item.cantidad : 0),
    0
  )
);

/** true cuando algún ítem no tiene precio (el total no es fiable). */
export const hayItemsSinPrecio = computed(carrito, (items) =>
  items.some((item) => !tienePrecio(item))
);

export const idDeItem = (productId: string, medida?: string, color?: string): string =>
  `${productId}::${medida ?? ""}::${color ?? ""}`;

/**
 * Agrega un ítem al carrito. Si ya existe uno con el mismo producto, medida y
 * color, solo sube la cantidad (y refresca los datos mutables).
 */
export function agregarItem(nuevo: NuevoItemCarrito): void {
  const cantidadPedida = nuevo.cantidad ?? 1;
  const cantidad =
    Number.isFinite(cantidadPedida) && cantidadPedida > 0 ? Math.floor(cantidadPedida) : 1;

  const id = idDeItem(nuevo.productId, nuevo.medida, nuevo.color);
  const { cantidad: _cantidad, ...datos } = nuevo;
  const actuales = carrito.get();
  const existente = actuales.find((item) => item.id === id);

  if (existente) {
    carrito.set(
      actuales.map((item) =>
        item.id === id
          ? { ...item, ...datos, id, cantidad: item.cantidad + cantidad }
          : item
      )
    );
    return;
  }

  carrito.set([...actuales, { ...datos, id, cantidad }]);
}

export function quitarItem(id: string): void {
  carrito.set(carrito.get().filter((item) => item.id !== id));
}

/** Suma `delta` a la cantidad; si baja de 1, el ítem se elimina. */
export function cambiarCantidad(id: string, delta: number): void {
  carrito.set(
    carrito
      .get()
      .map((item) =>
        item.id === id ? { ...item, cantidad: item.cantidad + delta } : item
      )
      .filter((item) => item.cantidad >= 1)
  );
}

export function vaciarCarrito(): void {
  carrito.set([]);
}

/** Valida la forma de un ítem guardado; los inválidos se descartan. */
function esItemCarrito(valor: unknown): valor is ItemCarrito {
  if (!valor || typeof valor !== "object") return false;

  const item = valor as Record<string, unknown>;
  const cadenaValida = (campo: unknown) => campo === undefined || typeof campo === "string";

  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.productId === "string" &&
    item.productId.length > 0 &&
    typeof item.nombre === "string" &&
    item.nombre.length > 0 &&
    typeof item.categoria === "string" &&
    typeof item.cantidad === "number" &&
    Number.isFinite(item.cantidad) &&
    item.cantidad >= 1 &&
    cadenaValida(item.medida) &&
    cadenaValida(item.color) &&
    cadenaValida(item.colorHex) &&
    cadenaValida(item.imagen) &&
    (item.precio === undefined ||
      (typeof item.precio === "number" && Number.isFinite(item.precio)))
  );
}

let cargado = false;

/**
 * Carga el carrito persistido y activa el guardado automático. Se llama una
 * sola vez (el widget lo hace tras montar). Los ítems malformados se
 * descartan; si `localStorage` está bloqueado, el carrito arranca vacío.
 */
export function cargarCarrito(): void {
  if (cargado || typeof window === "undefined") return;
  cargado = true;

  try {
    const crudo = window.localStorage.getItem(CLAVE_ALMACEN);
    if (crudo) {
      const datos: unknown = JSON.parse(crudo);
      if (Array.isArray(datos)) {
        carrito.set(
          datos
            .filter(esItemCarrito)
            .map((item) => ({ ...item, cantidad: Math.max(1, Math.floor(item.cantidad)) }))
        );
      }
    }
  } catch {
    // localStorage bloqueado o JSON corrupto: se arranca con el carrito vacío.
  }

  // La persistencia se activa después de cargar: suscribirse antes guardaría
  // el carrito vacío inicial y borraría el guardado del usuario.
  carrito.listen(() => {
    try {
      window.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(carrito.get()));
    } catch {
      // Sin persistencia disponible: el carrito sigue en memoria.
    }
  });
}

/**
 * Mensaje de WhatsApp con el detalle del carrito. El total solo se incluye
 * cuando todos los ítems tienen precio; los que se cotizan se anuncian como
 * "Cotización".
 */
export function mensajeDeCompra(items: ItemCarrito[]): string {
  const lineas = items.map((item) => {
    const partes = [`• ${item.cantidad}x ${item.nombre}`, item.categoria || "Sin categoría"];
    if (item.medida) partes.push(`Medida: ${item.medida}`);
    if (item.color) partes.push(`Color: ${item.color}`);
    partes.push(tienePrecio(item) ? formatPrice(item.precio!) : "Cotización");
    return partes.join(" — ");
  });

  const mensaje = ["Hola, quiero comprar:", ...lineas];

  if (items.length > 0 && items.every(tienePrecio)) {
    const total = items.reduce((suma, item) => suma + item.precio! * item.cantidad, 0);
    mensaje.push(`Total de referencia: ${formatPrice(total)}`);
  }

  return mensaje.join("\n");
}
