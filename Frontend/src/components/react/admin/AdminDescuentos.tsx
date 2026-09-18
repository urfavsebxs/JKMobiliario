import { useMemo, useState } from "react";
import { proxyImageUrl } from "../../../lib/images";
import { descuentoAplicable, formatPrice, precioConDescuento } from "../../../lib/precio";
import type { Product } from "../../../lib/types";
import { adminFetch, ErrorApi, mensajeError } from "./adminApi";

interface Props {
  products: Product[];
  /** Total de productos en el backend (puede superar a `products` por el tope de 100). */
  total: number;
}

type Aviso = { tipo: "ok" | "error"; texto: string };

type ValidacionPorcentaje =
  | { ok: true; valor: number }
  | { ok: false; error: string };

/**
 * Valida un porcentaje escrito por el usuario sin recortes silenciosos:
 * debe ser un entero entre 0 y 100.
 */
function validarPorcentaje(crudo: string): ValidacionPorcentaje {
  const texto = crudo.trim();
  if (texto === "") {
    return { ok: false, error: "Escribe un porcentaje entero entre 0 y 100." };
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) {
    return { ok: false, error: "El porcentaje debe ser un número." };
  }
  if (!Number.isInteger(numero)) {
    return { ok: false, error: "El porcentaje debe ser un entero, sin decimales." };
  }
  if (numero < 0 || numero > 100) {
    return { ok: false, error: "El porcentaje debe estar entre 0 y 100." };
  }

  return { ok: true, valor: numero };
}

export default function AdminDescuentos({ products, total }: Props) {
  const [productos, setProductos] = useState<Product[]>(products);
  const [borradores, setBorradores] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p._id, String(descuentoAplicable(p.discountPercent))]))
  );
  const [ocupados, setOcupados] = useState<Record<string, boolean>>({});
  const [erroresFila, setErroresFila] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Acción masiva
  const [categoria, setCategoria] = useState("");
  const [porcentajeLote, setPorcentajeLote] = useState("10");
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ hechos: number; total: number } | null>(null);
  const [resumenLote, setResumenLote] = useState<{
    categoria: string;
    aplicados: number;
    fallidos: string[];
  } | null>(null);

  const categorias = useMemo(
    () =>
      [...new Set(productos.map((p) => p.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es")
      ),
    [productos]
  );

  const actualizarProducto = (actualizado: Product) => {
    setProductos((prev) =>
      prev.map((producto) =>
        producto._id === actualizado._id ? { ...producto, ...actualizado } : producto
      )
    );
  };

  const aplicarDescuento = async (producto: Product, porcentaje: number) => {
    setAviso(null);
    setOcupados((prev) => ({ ...prev, [producto._id]: true }));

    try {
      const actualizado = await adminFetch<Product>(
        `/api/products/${producto._id}/discount`,
        { method: "PATCH", body: JSON.stringify({ discountPercent: porcentaje }) }
      );

      actualizarProducto(actualizado);
      setBorradores((prev) => ({ ...prev, [producto._id]: String(porcentaje) }));
      setAviso({
        tipo: "ok",
        texto:
          porcentaje > 0
            ? `«${producto.name}»: descuento de ${porcentaje} % aplicado.`
            : `«${producto.name}»: descuento retirado.`,
      });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al aplicar el descuento") });
    } finally {
      setOcupados((prev) => {
        const copia = { ...prev };
        delete copia[producto._id];
        return copia;
      });
    }
  };

  const aplicarDelInput = (producto: Product) => {
    const validacion = validarPorcentaje(borradores[producto._id] ?? "");

    if (!validacion.ok) {
      setErroresFila((prev) => ({ ...prev, [producto._id]: validacion.error }));
      return;
    }

    setErroresFila((prev) => {
      const copia = { ...prev };
      delete copia[producto._id];
      return copia;
    });
    void aplicarDescuento(producto, validacion.valor);
  };

  const ejecutarLote = async (modo: "aplicar" | "quitar") => {
    const seleccionados = productos.filter((p) => p.category === categoria);

    if (!categoria || seleccionados.length === 0) {
      setAviso({ tipo: "error", texto: "Elige una categoría con productos." });
      return;
    }

    let porcentaje = 0;

    if (modo === "aplicar") {
      const validacion = validarPorcentaje(porcentajeLote);
      if (!validacion.ok) {
        setAviso({ tipo: "error", texto: `Porcentaje del lote: ${validacion.error}` });
        return;
      }
      porcentaje = validacion.valor;
    }

    setAviso(null);
    setResumenLote(null);
    setProcesandoLote(true);
    setProgresoLote({ hechos: 0, total: seleccionados.length });

    const fallidos: string[] = [];
    let aplicados = 0;

    for (const producto of seleccionados) {
      try {
        // En secuencia: evita ráfagas de escrituras concurrentes en el backend.
        const actualizado = await adminFetch<Product>(
          `/api/products/${producto._id}/discount`,
          { method: "PATCH", body: JSON.stringify({ discountPercent: porcentaje }) }
        );

        actualizarProducto(actualizado);
        setBorradores((prev) => ({ ...prev, [producto._id]: String(porcentaje) }));
        aplicados++;
      } catch (error) {
        if (error instanceof ErrorApi && error.estado === 401) {
          setProcesandoLote(false);
          setProgresoLote(null);
          return;
        }
        fallidos.push(`${producto.name}: ${mensajeError(error, "error desconocido")}`);
      }

      setProgresoLote((prev) => (prev ? { hechos: prev.hechos + 1, total: prev.total } : null));
    }

    setResumenLote({ categoria, aplicados, fallidos });
    setProcesandoLote(false);
    setProgresoLote(null);
  };

  return (
    <div className="space-y-6">
      {products.length < total && (
        <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Mostrando {products.length} de {total} productos. Las acciones masivas solo aplican a los
          productos listados.
        </p>
      )}

      {/* Acción masiva por categoría */}
      <section
        aria-label="Aplicar descuento por categoría"
        className="rounded-lg bg-white p-4 shadow sm:p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">Descuento masivo por categoría</h2>
        <p className="mt-1 text-sm text-gray-500">
          Aplica un porcentaje a todos los productos de una categoría, uno por uno.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="lote-categoria"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Categoría
            </label>
            <select
              id="lote-categoria"
              value={categoria}
              onChange={(evento) => setCategoria(evento.target.value)}
              disabled={procesandoLote}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            >
              <option value="">Elige una categoría…</option>
              {categorias.map((nombre) => {
                const cantidad = productos.filter((p) => p.category === nombre).length;
                return (
                  <option key={nombre} value={nombre}>
                    {nombre} ({cantidad})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label
              htmlFor="lote-porcentaje"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Descuento (%)
            </label>
            <input
              id="lote-porcentaje"
              type="number"
              min="0"
              max="100"
              step="1"
              value={porcentajeLote}
              onChange={(evento) => setPorcentajeLote(evento.target.value)}
              disabled={procesandoLote}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={() => void ejecutarLote("aplicar")}
            disabled={procesandoLote || !categoria}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {procesandoLote ? "Aplicando…" : "Aplicar a la categoría"}
          </button>

          <button
            type="button"
            onClick={() => void ejecutarLote("quitar")}
            disabled={procesandoLote || !categoria}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quitar descuento a la categoría
          </button>
        </div>

        {progresoLote && (
          <p role="status" aria-live="polite" className="mt-3 text-sm text-jk-gold-deep">
            Procesando {progresoLote.hechos} de {progresoLote.total}…
          </p>
        )}

        {resumenLote && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
              resumenLote.fallidos.length === 0
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-yellow-200 bg-yellow-50 text-yellow-800"
            }`}
          >
            <p>
              Categoría «{resumenLote.categoria}»: {resumenLote.aplicados} producto(s)
              actualizados, {resumenLote.fallidos.length} fallo(s).
            </p>
            {resumenLote.fallidos.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5">
                {resumenLote.fallidos.map((fallo) => (
                  <li key={fallo}>{fallo}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {aviso && (
        <div
          role={aviso.tipo === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            aviso.tipo === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* Listado producto a producto */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Producto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Precio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Descuento actual
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Nuevo (%)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Precio final
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {productos.map((producto) => {
                const actual = descuentoAplicable(producto.discountPercent);
                const borrador = borradores[producto._id] ?? String(actual);
                const porcentajeVista = descuentoAplicable(Number(borrador));
                const precioFinal = precioConDescuento(producto.price, porcentajeVista);
                const ocupado = ocupados[producto._id] === true;

                return (
                  <tr key={producto._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          {producto.images?.[0] ? (
                            <img
                              className="h-10 w-10 rounded object-cover"
                              src={proxyImageUrl(producto.images[0])}
                              alt=""
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200 text-gray-400">
                              —
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{producto.name}</div>
                          <div className="text-xs text-gray-500">{producto.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {formatPrice(producto.price)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {actual > 0 ? (
                        <span className="inline-flex rounded-full bg-jk-gold/30 px-2 text-xs font-semibold leading-5 text-jk-gold-deep">
                          -{actual} %
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <label htmlFor={`descuento-${producto._id}`} className="sr-only">
                        Porcentaje de descuento para {producto.name}
                      </label>
                      <input
                        id={`descuento-${producto._id}`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={borrador}
                        onChange={(evento) => {
                          setBorradores((prev) => ({
                            ...prev,
                            [producto._id]: evento.target.value,
                          }));
                          setErroresFila((prev) => {
                            if (!prev[producto._id]) return prev;
                            const copia = { ...prev };
                            delete copia[producto._id];
                            return copia;
                          });
                        }}
                        disabled={ocupado}
                        aria-invalid={Boolean(erroresFila[producto._id])}
                        aria-describedby={
                          erroresFila[producto._id]
                            ? `descuento-error-${producto._id}`
                            : undefined
                        }
                        className={`w-24 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60 ${
                          erroresFila[producto._id] ? "border-red-400" : "border-gray-300"
                        }`}
                      />
                      {erroresFila[producto._id] && (
                        <p
                          id={`descuento-error-${producto._id}`}
                          role="alert"
                          className="mt-1 w-40 whitespace-normal text-xs text-red-600"
                        >
                          {erroresFila[producto._id]}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <span
                        className={porcentajeVista > 0 ? "font-semibold text-green-700" : "text-gray-900"}
                      >
                        {formatPrice(precioFinal)}
                      </span>
                      {porcentajeVista > 0 && (
                        <span className="ml-2 text-xs text-gray-400 line-through">
                          {formatPrice(producto.price)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => aplicarDelInput(producto)}
                        disabled={ocupado}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
                      >
                        {ocupado ? "Guardando…" : "Aplicar"}
                      </button>
                      {actual > 0 && (
                        <button
                          type="button"
                          onClick={() => void aplicarDescuento(producto, 0)}
                          disabled={ocupado}
                          className="ml-2 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Quitar descuento
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {productos.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">No hay productos para administrar.</p>
        )}
      </div>
    </div>
  );
}
