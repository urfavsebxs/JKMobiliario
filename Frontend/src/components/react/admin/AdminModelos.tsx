import { useMemo, useRef, useState } from "react";
import Visor3D from "../Visor3D";
import { proxyImageUrl } from "../../../lib/images";
import { proxyModelUrl } from "../../../lib/modelos";
import { setColorMueble } from "../../../lib/colorMueble";
import { fijarMedidas } from "../../../lib/medidasMueble";
import type { MedidasBase, Product } from "../../../lib/types";
import { adminFetch, mensajeError, subirArchivoConProgreso } from "./adminApi";

const MODELO_MAX_MB = 25;

const CAMPOS_MEDIDA: Array<{ campo: keyof DraftMedidas; etiqueta: string }> = [
  { campo: "ancho", etiqueta: "Ancho (cm)" },
  { campo: "largo", etiqueta: "Largo (cm)" },
  { campo: "alto", etiqueta: "Alto (cm)" },
];

interface DraftMedidas {
  ancho: string;
  largo: string;
  alto: string;
}

interface Props {
  products: Product[];
  /** Total de productos en el backend (puede superar a `products` por el tope de 100). */
  total: number;
}

type Aviso = { tipo: "ok" | "error"; texto: string };

/** Valida extensión y tamaño antes de tocar la red. Devuelve el mensaje de error o null. */
function validarModelo(archivo: File): string | null {
  if (!archivo.name.toLowerCase().endsWith(".glb")) {
    return "Solo se admiten modelos .glb (GLTF binario). Selecciona un archivo con extensión .glb.";
  }
  if (archivo.size > MODELO_MAX_MB * 1024 * 1024) {
    return `El modelo supera el máximo de ${MODELO_MAX_MB} MB (archivo: ${(
      archivo.size / 1048576
    ).toFixed(1)} MB).`;
  }
  return null;
}

export default function AdminModelos({ products, total }: Props) {
  const [productos, setProductos] = useState<Product[]>(products);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  /** id de producto → porcentaje de subida mientras hay un XHR activo. */
  const [subiendo, setSubiendo] = useState<Record<string, number>>({});
  const [guardandoMedidas, setGuardandoMedidas] = useState<Record<string, boolean>>({});
  const [archivos, setArchivos] = useState<Record<string, File | null>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftMedidas>>({});
  const [expandido, setExpandido] = useState<string | null>(null);

  const inputsArchivo = useRef<Record<string, HTMLInputElement | null>>({});

  const conModelo = useMemo(
    () => productos.filter((producto) => Boolean(producto.model3d)).length,
    [productos]
  );

  const actualizarProducto = (actualizado: Product) => {
    setProductos((prev) =>
      prev.map((producto) =>
        producto._id === actualizado._id
          ? {
              ...producto,
              ...actualizado,
              // El backend omite estas claves al borrar el modelo o limpiar las
              // medidas; sin asignarlas explícitamente el spread conservaría el
              // valor viejo (modelo/medidas fantasma) y el borrador se
              // rellenaría con las medidas antiguas.
              model3d: actualizado.model3d,
              medidasBase: actualizado.medidasBase,
            }
          : producto
      )
    );
  };

  // ─── Modelo 3D ─────────────────────────────────────────────────────
  const seleccionarArchivo = (
    producto: Product,
    evento: React.ChangeEvent<HTMLInputElement>
  ) => {
    const archivo = evento.target.files?.[0] ?? null;

    if (!archivo) {
      setArchivos((prev) => ({ ...prev, [producto._id]: null }));
      return;
    }

    const errorValidacion = validarModelo(archivo);
    if (errorValidacion) {
      setAviso({ tipo: "error", texto: errorValidacion });
      evento.target.value = "";
      setArchivos((prev) => ({ ...prev, [producto._id]: null }));
      return;
    }

    setAviso(null);
    setArchivos((prev) => ({ ...prev, [producto._id]: archivo }));
  };

  const subirModelo = async (producto: Product, archivo: File) => {
    setAviso(null);
    setSubiendo((prev) => ({ ...prev, [producto._id]: 0 }));

    try {
      const actualizado = await subirArchivoConProgreso<Product>(
        `/api/products/${producto._id}/model`,
        "model",
        archivo,
        (porcentaje) => setSubiendo((prev) => ({ ...prev, [producto._id]: porcentaje }))
      );

      actualizarProducto(actualizado);
      setArchivos((prev) => ({ ...prev, [producto._id]: null }));

      const input = inputsArchivo.current[producto._id];
      if (input) input.value = "";

      setAviso({ tipo: "ok", texto: `Modelo 3D de «${producto.name}» actualizado.` });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al subir el modelo 3D") });
    } finally {
      setSubiendo((prev) => {
        const copia = { ...prev };
        delete copia[producto._id];
        return copia;
      });
    }
  };

  const eliminarModelo = async (producto: Product) => {
    if (!window.confirm(`¿Eliminar el modelo 3D de «${producto.name}»?`)) return;

    setAviso(null);
    try {
      const actualizado = await adminFetch<Product>(`/api/products/${producto._id}/model`, {
        method: "DELETE",
      });

      actualizarProducto(actualizado);
      if (expandido === producto._id) setExpandido(null);
      setAviso({ tipo: "ok", texto: `Modelo 3D de «${producto.name}» eliminado.` });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al eliminar el modelo 3D") });
    }
  };

  // ─── Medidas base (cm) ─────────────────────────────────────────────
  const draftDe = (producto: Product): DraftMedidas =>
    drafts[producto._id] ?? {
      ancho: producto.medidasBase?.ancho?.toString() ?? "",
      largo: producto.medidasBase?.largo?.toString() ?? "",
      alto: producto.medidasBase?.alto?.toString() ?? "",
    };

  const cambiarMedida = (
    producto: Product,
    campo: keyof DraftMedidas,
    valor: string
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [producto._id]: { ...draftDe(producto), [campo]: valor },
    }));
  };

  const guardarMedidas = async (producto: Product, medidas: MedidasBase) => {
    setAviso(null);
    setGuardandoMedidas((prev) => ({ ...prev, [producto._id]: true }));

    try {
      const actualizado = await adminFetch<Product>(
        `/api/products/${producto._id}/medidas`,
        { method: "PATCH", body: JSON.stringify({ medidasBase: medidas }) }
      );

      actualizarProducto(actualizado);
      // El draft se descarta para que los inputs reflejen lo que confirmó el backend.
      setDrafts((prev) => {
        const copia = { ...prev };
        delete copia[producto._id];
        return copia;
      });

      const resumen =
        Object.keys(medidas).length > 0
          ? `medidas (${Object.entries(medidas)
              .map(([eje, valor]) => `${eje}: ${valor} cm`)
              .join(", ")})`
          : "medidas vacías";

      setAviso({ tipo: "ok", texto: `«${producto.name}»: ${resumen} guardadas.` });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al guardar las medidas") });
    } finally {
      setGuardandoMedidas((prev) => {
        const copia = { ...prev };
        delete copia[producto._id];
        return copia;
      });
    }
  };

  const guardarMedidasDelFormulario = (producto: Product) => {
    const draft = draftDe(producto);
    const medidas: MedidasBase = {};

    (["ancho", "largo", "alto"] as const).forEach((eje) => {
      const valor = Number(draft[eje]);
      if (Number.isFinite(valor) && valor > 0) medidas[eje] = valor;
    });

    if (Object.keys(medidas).length === 0) {
      setAviso({
        tipo: "error",
        texto: "Escribe al menos una medida mayor que 0, o usa «Limpiar medidas».",
      });
      return;
    }

    void guardarMedidas(producto, medidas);
  };

  const limpiarMedidas = async (producto: Product) => {
    if (
      !window.confirm(
        `¿Limpiar las medidas base de «${producto.name}»? El visor 3D volverá a su escala original.`
      )
    ) {
      return;
    }
    await guardarMedidas(producto, {});
  };

  // ─── Vista previa 3D ───────────────────────────────────────────────
  const alternarPreview = (producto: Product) => {
    if (expandido === producto._id) {
      setExpandido(null);
      return;
    }
    // El visor comparte stores globales de color y medidas; se reinician para
    // que cada previsualización arranque con el estado original del modelo.
    setColorMueble(null);
    fijarMedidas(null);
    setExpandido(producto._id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {productos.length} productos · {conModelo} con modelo 3D
        </p>
      </div>

      {products.length < total && (
        <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Mostrando {products.length} de {total} productos. La administración solo aplica a los
          productos listados.
        </p>
      )}

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

      <ul className="space-y-4">
        {productos.map((producto) => {
          const progreso = subiendo[producto._id];
          const subiendoAhora = progreso !== undefined;
          const guardando = guardandoMedidas[producto._id] === true;
          const archivo = archivos[producto._id] ?? null;
          const draft = draftDe(producto);
          const abierto = expandido === producto._id;

          return (
            <li key={producto._id} className="overflow-hidden rounded-lg bg-white shadow">
              {/* Cabecera del producto */}
              <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
                <div className="h-12 w-12 flex-shrink-0">
                  {producto.images?.[0] ? (
                    <img
                      className="h-12 w-12 rounded object-cover"
                      src={proxyImageUrl(producto.images[0])}
                      alt={`Miniatura de ${producto.name}`}
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200 text-gray-400">
                      —
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{producto.name}</p>
                  <p className="text-xs text-gray-500">{producto.category || "Sin categoría"}</p>
                </div>

                {producto.model3d ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                    Con modelo 3D
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                    Sin modelo
                  </span>
                )}
              </div>

              <div className="grid gap-6 px-4 py-4 sm:px-6 lg:grid-cols-2">
                {/* Subida / borrado del modelo */}
                <section aria-label={`Modelo 3D de ${producto.name}`}>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Modelo 3D (.glb)</h3>
                  <p className="mb-1 text-xs text-gray-500">
                    Máximo {MODELO_MAX_MB} MB. Al subir uno nuevo se reemplaza el actual.
                  </p>
                  <p className="mb-3 text-xs text-amber-700">
                    Si reemplazas el modelo, revisa que las medidas base correspondan al nuevo
                    archivo.
                  </p>

                  <input
                    ref={(nodo) => {
                      inputsArchivo.current[producto._id] = nodo;
                    }}
                    id={`modelo-${producto._id}`}
                    type="file"
                    accept=".glb,model/gltf-binary"
                    onChange={(evento) => seleccionarArchivo(producto, evento)}
                    disabled={subiendoAhora}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 disabled:opacity-60"
                  />
                  <label htmlFor={`modelo-${producto._id}`} className="sr-only">
                    Seleccionar modelo .glb para {producto.name}
                  </label>

                  {archivo && (
                    <p className="mt-2 text-xs text-gray-600">
                      Seleccionado: <span className="font-medium">{archivo.name}</span> (
                      {(archivo.size / 1048576).toFixed(1)} MB)
                    </p>
                  )}

                  {subiendoAhora && (
                    <p role="status" aria-live="polite" className="mt-2 text-xs font-medium text-jk-gold-deep">
                      Subiendo… ({progreso} %)
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => archivo && void subirModelo(producto, archivo)}
                      disabled={!archivo || subiendoAhora}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {subiendoAhora
                        ? `Subiendo… (${progreso} %)`
                        : producto.model3d
                          ? "Reemplazar modelo"
                          : "Subir modelo"}
                    </button>

                    {producto.model3d && (
                      <button
                        type="button"
                        onClick={() => void eliminarModelo(producto)}
                        disabled={subiendoAhora}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        Eliminar modelo
                      </button>
                    )}
                  </div>
                </section>

                {/* Medidas base del modelo */}
                <section aria-label={`Medidas base de ${producto.name}`}>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Medidas base (cm)</h3>
                  <p className="mb-3 text-xs text-gray-500">
                    Medidas reales del modelo GLB; permiten escalarlo a las medidas que pida el
                    cliente.
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    {CAMPOS_MEDIDA.map(({ campo, etiqueta }) => (
                      <div key={campo}>
                        <label
                          htmlFor={`medida-${producto._id}-${campo}`}
                          className="mb-1 block text-xs font-medium text-gray-700"
                        >
                          {etiqueta}
                        </label>
                        <input
                          id={`medida-${producto._id}-${campo}`}
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          placeholder="cm"
                          value={draft[campo]}
                          onChange={(evento) => cambiarMedida(producto, campo, evento.target.value)}
                          disabled={guardando}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
                        />
                      </div>
                    ))}
                  </div>

                  {producto.medidasBase && (
                    <p className="mt-2 text-xs text-gray-500">
                      Actuales: {producto.medidasBase.ancho ?? "—"} ×{" "}
                      {producto.medidasBase.largo ?? "—"} × {producto.medidasBase.alto ?? "—"} cm
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => guardarMedidasDelFormulario(producto)}
                      disabled={guardando}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
                    >
                      {guardando ? "Guardando…" : "Guardar medidas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void limpiarMedidas(producto)}
                      disabled={guardando || !producto.medidasBase}
                      className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50"
                    >
                      Limpiar medidas
                    </button>
                  </div>
                </section>
              </div>

              {/* Vista previa 3D */}
              <div className="border-t border-gray-100 px-4 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => alternarPreview(producto)}
                  disabled={!producto.model3d}
                  aria-expanded={abierto}
                  className="rounded-lg border border-jk-gold px-4 py-2 text-sm font-medium text-jk-gold-deep transition-colors hover:bg-jk-cream disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {abierto ? "Ocultar vista previa" : "Previsualizar en 3D"}
                </button>
                {!producto.model3d && (
                  <span className="ml-3 text-xs text-gray-500">
                    Sube un modelo para previsualizarlo.
                  </span>
                )}
              </div>

              {abierto && producto.model3d && (
                <div className="border-t border-gray-100 bg-jk-surface px-4 pb-4 sm:px-6">
                  <Visor3D
                    modelUrl={proxyModelUrl(producto.model3d)}
                    colores={producto.colors ?? []}
                    nombre={producto.name}
                    medidasBase={producto.medidasBase}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {productos.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-gray-500 shadow">
          No hay productos para administrar.
        </div>
      )}
    </div>
  );
}
