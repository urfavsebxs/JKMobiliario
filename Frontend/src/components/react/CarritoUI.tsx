import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import {
  agregarItem,
  cambiarCantidad,
  cargarCarrito,
  carrito,
  hayItemsSinPrecio,
  mensajeDeCompra,
  quitarItem,
  totalItems,
  totalPrecio,
  vaciarCarrito,
} from "../../lib/carrito";
import { formatPrice } from "../../lib/precio";

/**
 * Carrito de compras client-side.
 *
 * - Se hidrata con `client:idle` (ver Layout.astro) junto al Asesor IA.
 * - El estado vive en `lib/carrito.ts` (nanostores + localStorage); aquí solo
 *   se pinta y se gestionan la accesibilidad y la delegación global de clics.
 * - Los botones `[data-agregar-carrito]` de las páginas Astro (tarjetas y ficha
 *   de producto) no necesitan isla propia: un único listener en `document`
 *   lee su `dataset` y agrega el ítem.
 */

const whatsapp = import.meta.env.PUBLIC_WHATSAPP_NUMBER || "";

function urlWhatsApp(texto: string): string {
  return whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`
    : "/#contacto";
}

function IconoCarrito({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17.5" cy="20" r="1.4" />
    </svg>
  );
}

function IconoWhatsApp() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" />
      <path d="M8.8 9.2c0 3.3 2.7 6 6 6l1.2-1.7-2-.8-.8.9a4.6 4.6 0 0 1-2.3-2.3l.9-.8-.8-2-1.7 1.2Z" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Lee el `dataset` de un botón y agrega el ítem al carrito. */
function agregarDesdeBoton(boton: HTMLElement): void {
  const { productId, nombre, categoria, medida, color, colorhex, precio, imagen } =
    boton.dataset;
  if (!productId || !nombre) return;

  const precioNum = Number(precio);
  agregarItem({
    productId,
    nombre,
    categoria: categoria?.trim() || "Sin categoría",
    medida: medida?.trim() || undefined,
    color: color?.trim() || undefined,
    colorHex: colorhex?.trim() || undefined,
    precio: Number.isFinite(precioNum) && precioNum > 0 ? precioNum : undefined,
    imagen: imagen?.trim() || undefined,
  });
}

export default function CarritoUI() {
  const items = useStore(carrito);
  const total = useStore(totalItems);
  const subtotal = useStore(totalPrecio);
  const faltanPrecios = useStore(hayItemsSinPrecio);

  const [abierto, setAbierto] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const focoPrevioRef = useRef<HTMLElement | null>(null);

  // Lectura de localStorage solo tras montar (nunca durante el SSR).
  useEffect(() => {
    cargarCarrito();
  }, []);

  const abrir = useCallback((origen?: HTMLElement | null) => {
    focoPrevioRef.current =
      origen ?? (document.activeElement as HTMLElement | null) ?? null;
    setAbierto(true);
  }, []);

  const cerrar = useCallback(() => {
    setAbierto(false);
    window.requestAnimationFrame(() => focoPrevioRef.current?.focus?.());
  }, []);

  // Escape + trampa de foco + bloqueo del scroll de fondo.
  useEffect(() => {
    if (!abierto) return;
    const panel = panelRef.current;
    panel?.focus();

    const alTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        cerrar();
        return;
      }
      if (evento.key !== "Tab" || !panel) return;

      const enfocables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((elemento) => elemento.offsetParent !== null);

      if (enfocables.length === 0) return;
      const primero = enfocables[0]!;
      const ultimo = enfocables[enfocables.length - 1]!;

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", alTeclado);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, cerrar]);

  // Delegación global: cualquier [data-agregar-carrito] del sitio agrega su
  // ítem. Da feedback breve en el propio botón y no abre el panel.
  useEffect(() => {
    const temporizadores = new WeakMap<HTMLElement, number>();

    const alClic = (evento: MouseEvent) => {
      if (evento.button !== 0 || evento.defaultPrevented) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;

      const objetivo = evento.target as Element | null;
      const boton = objetivo?.closest?.("[data-agregar-carrito]") as HTMLElement | null;
      if (!boton) return;

      evento.preventDefault();
      agregarDesdeBoton(boton);

      const etiqueta = boton.querySelector<HTMLElement>("[data-jk-carrito-label]");
      if (!etiqueta) return;

      const original = etiqueta.textContent ?? "";
      etiqueta.textContent = etiqueta.dataset.agregado || "Agregado ✓";

      const previo = temporizadores.get(boton);
      if (previo) window.clearTimeout(previo);
      temporizadores.set(
        boton,
        window.setTimeout(() => {
          if (etiqueta.isConnected) etiqueta.textContent = original;
          temporizadores.delete(boton);
        }, 1200),
      );
    };

    document.addEventListener("click", alClic);
    return () => document.removeEventListener("click", alClic);
  }, []);

  const comprar = () => {
    const actuales = carrito.get();
    if (actuales.length === 0) return;
    window.open(urlWhatsApp(mensajeDeCompra(actuales)), "_blank", "noopener,noreferrer");
  };

  const etiquetaTotal = total === 1 ? "1 producto" : `${total} productos`;

  return (
    <>
      {/* Anuncio para lectores de pantalla al cambiar el contador. */}
      <p className="sr-only" aria-live="polite">
        {total === 0 ? "El carrito está vacío" : `${etiquetaTotal} en el carrito`}
      </p>

      {/* Burbuja flotante (menor z-index que el chat: 80/90). En móvil se
          oculta al abrir para no tapar la hoja inferior. */}
      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? cerrar() : abrir(botonRef.current))}
        aria-label={abierto ? "Cerrar el carrito" : `Abrir carrito, ${etiquetaTotal}`}
        aria-expanded={abierto}
        aria-controls="jk-carrito-panel"
        className={`fixed left-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[75] h-14 w-14 items-center justify-center rounded-full bg-jk-gold text-jk-ink shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold motion-safe:transition-transform sm:left-6 sm:bottom-6 ${
          abierto ? "hidden sm:flex" : "flex"
        }`}
      >
        <IconoCarrito />
        {total > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-jk-ink bg-jk-ink px-1.5 font-sans text-[12px] font-bold text-jk-gold"
            aria-hidden="true"
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[73]">
          <div
            className="absolute inset-0 bg-black/60 motion-safe:animate-[jk-asesor-fade_150ms_ease-out]"
            onClick={cerrar}
            aria-hidden="true"
          />

          <section
            ref={panelRef}
            id="jk-carrito-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="jk-carrito-titulo"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-2xl border border-jk-gold/40 bg-jk-ink text-white shadow-[0_-8px_40px_rgba(0,0,0,0.6)] outline-none motion-safe:animate-[jk-asesor-in_200ms_ease-out] sm:inset-x-auto sm:right-6 sm:bottom-24 sm:max-h-[min(620px,calc(100dvh-7.5rem))] sm:w-[420px] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 border-b border-jk-gold/30 px-4 py-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jk-gold text-jk-ink"
                aria-hidden="true"
              >
                <IconoCarrito className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="jk-carrito-titulo"
                  className="font-brand text-[20px] font-semibold leading-tight text-jk-gold"
                >
                  Tu carrito
                </h2>
                <p className="font-sans text-[12px] leading-tight text-white/70">
                  {etiquetaTotal}
                </p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar el carrito"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14 text-center">
                <span className="text-white/40" aria-hidden="true">
                  <IconoCarrito className="h-12 w-12" />
                </span>
                <p className="font-sans text-[16px] text-white/80">
                  Tu carrito está vacío
                </p>
                <a
                  href="/catalogo"
                  className="flex min-h-[44px] items-center justify-center rounded-xl bg-jk-gold px-5 font-label text-[15px] font-medium text-jk-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
                >
                  Ver catálogo
                </a>
              </div>
            ) : (
              <>
                <ul className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex gap-3 border-b border-white/10 pb-4 last:border-b-0 last:pb-0"
                    >
                      {item.imagen ? (
                        <img
                          src={item.imagen}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-[4px] border border-jk-gold/40 object-cover"
                        />
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-[15px] font-medium">
                          {item.nombre}
                        </p>
                        <p className="font-sans text-[12px] text-white/60">
                          {item.categoria}
                        </p>
                        {(item.medida || item.color) && (
                          <p className="mt-0.5 font-sans text-[12px] text-jk-gold">
                            {[
                              item.medida ? `Medida: ${item.medida}` : "",
                              item.color ? `Color: ${item.color}` : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="font-sans text-[14px] font-semibold">
                            {item.precio && item.precio > 0
                              ? formatPrice(item.precio)
                              : "Cotización"}
                          </p>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => cambiarCantidad(item.id, -1)}
                              aria-label={`Quitar una unidad de ${item.nombre}`}
                              className="flex h-11 w-11 items-center justify-center rounded-lg border border-jk-gold/40 text-[18px] leading-none text-jk-gold transition-colors hover:bg-jk-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
                            >
                              −
                            </button>
                            <span
                              className="min-w-[2.5ch] text-center font-sans text-[15px]"
                              aria-label={`Cantidad: ${item.cantidad}`}
                            >
                              {item.cantidad}
                            </span>
                            <button
                              type="button"
                              onClick={() => cambiarCantidad(item.id, 1)}
                              aria-label={`Añadir una unidad de ${item.nombre}`}
                              className="flex h-11 w-11 items-center justify-center rounded-lg border border-jk-gold/40 text-[18px] leading-none text-jk-gold transition-colors hover:bg-jk-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => quitarItem(item.id)}
                        aria-label={`Quitar ${item.nombre} del carrito`}
                        className="flex h-11 w-11 shrink-0 items-start justify-center rounded-lg pt-2.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
                      >
                        <IconoBasura />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-jk-gold/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={vaciarCarrito}
                      className="min-h-[44px] font-sans text-[13px] font-medium text-white/60 underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
                    >
                      Vaciar carrito
                    </button>

                    {!faltanPrecios && (
                      <p className="font-sans text-[14px] text-white/80">
                        Subtotal de referencia:{" "}
                        <span className="font-semibold text-jk-gold">
                          {formatPrice(subtotal)}
                        </span>
                      </p>
                    )}
                  </div>

                  <p className="mb-3 font-sans text-[12px] leading-snug text-white/60">
                    Los precios son de referencia; un asesor confirma la cotización final.
                  </p>

                  <button
                    type="button"
                    onClick={comprar}
                    disabled={items.length === 0}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-jk-gold px-4 font-label text-[15px] font-medium text-jk-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconoWhatsApp />
                    Comprar por WhatsApp
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
