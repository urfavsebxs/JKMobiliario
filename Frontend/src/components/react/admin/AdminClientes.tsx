import { useEffect, useMemo, useRef, useState } from "react";
import type { CanalCliente, Cliente } from "../../../lib/types";
import { adminFetch, ErrorApi, mensajeError } from "./adminApi";

type Aviso = { tipo: "ok" | "error"; texto: string };

/** Formulario de corrección de la ficha. Solo lo que el dueño puede tocar. */
interface EdicionFicha {
  id: string;
  nombre: string;
  /** Etiquetas separadas por comas en el input; se parten al guardar. */
  etiquetas: string;
  notas: string;
  reclamoActivo: boolean;
  reclamoDetalle: string;
}

const ETIQUETA_CANAL: Record<CanalCliente, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

const formatearFecha = (iso?: string): string => {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatearMonto = (monto?: number): string => {
  if (typeof monto !== "number") return "—";
  return monto.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
};

/**
 * Cómo llamar al cliente en la lista.
 *
 * Se prefiere el nombre que dio en la conversación; si el asesor todavía no lo
 * sacó, el del perfil de WhatsApp, que es un dato real y ya viene guardado. El
 * identificador es el último recurso: en WhatsApp es un teléfono y se lee, pero
 * en Messenger es un PSID y no dice nada.
 */
const nombreVisible = (cliente: Cliente): string =>
  cliente.nombre?.trim() || cliente.nombrePerfil?.trim() || cliente.identificador;

/** Un reclamo abierto solo cuenta si es `true` explícito. */
const tieneReclamo = (cliente: Cliente): boolean => cliente.reclamo?.activo === true;

const aEdicion = (cliente: Cliente): EdicionFicha => ({
  id: cliente._id,
  nombre: cliente.nombre ?? "",
  etiquetas: (cliente.etiquetas ?? []).join(", "),
  notas: cliente.notas ?? "",
  reclamoActivo: tieneReclamo(cliente),
  reclamoDetalle: cliente.reclamo?.detalle ?? "",
});

const partirEtiquetas = (texto: string): string[] =>
  texto
    .split(",")
    .map((etiqueta) => etiqueta.trim())
    .filter(Boolean);

/**
 * Fichas de cliente: lo que el asesor recuerda de quien vuelve a escribir.
 *
 * La lista la escribe el paso automático del flujo de WhatsApp. Aquí el dueño
 * solo corrige: el nombre, las etiquetas y —sobre todo— las `notas`, que es el
 * único campo que la IA no puede tocar (el backend rechaza el upsert que las
 * incluya, ver `fichaUpsertSchema`).
 *
 * Sin props: carga la lista al montar y opera contra /api/clientes.
 */
export default function AdminClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [edicion, setEdicion] = useState<EdicionFicha | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const focoOrigenRef = useRef<HTMLElement | null>(null);
  const idEdicion = edicion?.id ?? null;

  // Foco al abrir la ficha (solo al cambiar de cliente, no en cada tecla).
  useEffect(() => {
    if (idEdicion) nombreRef.current?.focus();
  }, [idEdicion]);

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const lista = await adminFetch<Cliente[]>("/api/clientes");
        if (!activo) return;
        setClientes(lista);
      } catch (error) {
        if (!activo) return;
        // El 401 ya redirige a /login dentro de adminFetch.
        if (error instanceof ErrorApi && error.estado === 401) return;
        setErrorCarga(mensajeError(error, "No se pudieron cargar los clientes"));
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, []);

  /**
   * Filtro en cliente sobre la lista ya cargada: el volumen es mínimo (una
   * ficha por persona que ha escrito) y así el buscador responde por tecla sin
   * ir al backend. Se busca también por el identificador crudo porque es lo que
   * el dueño tiene a mano si copia el teléfono de la conversación.
   */
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter((cliente) =>
      [cliente.nombre, cliente.nombrePerfil, cliente.identificador, cliente.identificadorOriginal]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termino))
    );
  }, [clientes, busqueda]);

  const abrir = (cliente: Cliente, origen?: HTMLElement | null) => {
    focoOrigenRef.current = origen ?? null;
    setErrorEdicion(null);
    setAviso(null);
    setEdicion(aEdicion(cliente));
  };

  const cerrar = () => {
    setEdicion(null);
    setErrorEdicion(null);
    window.requestAnimationFrame(() => focoOrigenRef.current?.focus?.());
  };

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!edicion) return;

    setGuardando(true);
    setErrorEdicion(null);
    setAviso(null);

    try {
      const actualizado = await adminFetch<Cliente>(`/api/clientes/${edicion.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: edicion.nombre.trim(),
          etiquetas: partirEtiquetas(edicion.etiquetas),
          notas: edicion.notas,
          reclamo: {
            activo: edicion.reclamoActivo,
            detalle: edicion.reclamoDetalle.trim(),
          },
        }),
      });

      setClientes((prev) => prev.map((c) => (c._id === actualizado._id ? actualizado : c)));
      setEdicion(aEdicion(actualizado));
      setAviso({ tipo: "ok", texto: `Ficha de ${nombreVisible(actualizado)} guardada.` });
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) return;
      setErrorEdicion(mensajeError(error, "No se pudo guardar la ficha"));
    } finally {
      setGuardando(false);
    }
  };

  const seleccionado = edicion ? clientes.find((c) => c._id === edicion.id) ?? null : null;

  return (
    <div className="space-y-6">
      {aviso && (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            aviso.tipo === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {/* Edición de la ficha */}
      {edicion && (
        <form
          onSubmit={guardar}
          aria-labelledby="ficha-titulo"
          className="rounded-lg border-2 border-jk-gold/60 bg-white p-4 shadow sm:p-6"
        >
          <h2 id="ficha-titulo" className="text-lg font-semibold text-gray-900">
            Ficha de {seleccionado ? nombreVisible(seleccionado) : "cliente"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {seleccionado
              ? `${ETIQUETA_CANAL[seleccionado.canal]} · ${seleccionado.identificador} · ${seleccionado.mensajesTotales} mensaje${
                  seleccionado.mensajesTotales === 1 ? "" : "s"
                } · último contacto ${formatearFecha(seleccionado.ultimoContacto)}`
              : ""}
          </p>

          {/* Lo que escribió la IA: solo lectura. Corregirlo se hace en la
              conversación, no aquí; si no, el siguiente mensaje lo reescribe. */}
          {seleccionado && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Lo que recuerda el asesor
              </h3>
              <p className="mt-2 text-sm text-gray-800">
                {seleccionado.resumen || "Todavía no hay resumen de la conversación."}
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Última compra</dt>
                  <dd className="text-gray-900">
                    {seleccionado.ultimaCompra?.producto || "—"}
                    {typeof seleccionado.ultimaCompra?.monto === "number" &&
                      ` · ${formatearMonto(seleccionado.ultimaCompra.monto)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Reclamo</dt>
                  <dd className="text-gray-900">
                    {tieneReclamo(seleccionado) ? seleccionado.reclamo?.detalle || "Abierto" : "Ninguno"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-gray-500">
                Esto lo escribe el asesor solo con cada conversación. Si algo está mal, se corrige
                hablando con el cliente.
              </p>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ficha-nombre" className="mb-1 block text-sm font-medium text-gray-700">
                Nombre
              </label>
              <input
                id="ficha-nombre"
                ref={nombreRef}
                type="text"
                value={edicion.nombre}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setEdicion((prev) => (prev ? { ...prev, nombre: valor } : prev));
                }}
                disabled={guardando}
                placeholder="Ej: Ana Gómez"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
              />
            </div>

            <div>
              <label htmlFor="ficha-etiquetas" className="mb-1 block text-sm font-medium text-gray-700">
                Etiquetas (separadas por comas)
              </label>
              <input
                id="ficha-etiquetas"
                type="text"
                value={edicion.etiquetas}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setEdicion((prev) => (prev ? { ...prev, etiquetas: valor } : prev));
                }}
                disabled={guardando}
                placeholder="Ej: mayorista, pide factura"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Las notas: el campo del dueño. La IA no puede escribirlas. */}
          <div className="mt-4">
            <label htmlFor="ficha-notas" className="mb-1 block text-sm font-medium text-gray-700">
              Notas privadas
            </label>
            <textarea
              id="ficha-notas"
              rows={3}
              value={edicion.notas}
              onChange={(evento) => {
                const valor = evento.target.value;
                setEdicion((prev) => (prev ? { ...prev, notas: valor } : prev));
              }}
              disabled={guardando}
              placeholder="Lo que quieras recordar tú. El asesor no lo lee ni lo puede cambiar."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-gray-500">
              Solo las ves tú. El paso automático no las toca: aunque el cliente escriba otra vez,
              se quedan como las dejes.
            </p>
          </div>

          <fieldset className="mt-4 rounded-lg border border-gray-200 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">Reclamo</legend>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={edicion.reclamoActivo}
                onChange={(evento) => {
                  const valor = evento.target.checked;
                  setEdicion((prev) => (prev ? { ...prev, reclamoActivo: valor } : prev));
                }}
                disabled={guardando}
                className="h-4 w-4 rounded border-gray-300"
              />
              Reclamo abierto
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Se cierra solo cuando lo desmarcas: un mensaje que no hable del reclamo no lo resuelve.
            </p>
            {edicion.reclamoActivo && (
              <div className="mt-3">
                <label htmlFor="ficha-reclamo" className="mb-1 block text-sm font-medium text-gray-700">
                  Detalle
                </label>
                <input
                  id="ficha-reclamo"
                  type="text"
                  value={edicion.reclamoDetalle}
                  onChange={(evento) => {
                    const valor = evento.target.value;
                    setEdicion((prev) => (prev ? { ...prev, reclamoDetalle: valor } : prev));
                  }}
                  disabled={guardando}
                  placeholder="Ej: Llegó rayada la mesa."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
                />
              </div>
            )}
          </fieldset>

          {errorEdicion && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorEdicion}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={cerrar}
              disabled={guardando}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50"
            >
              Cerrar
            </button>
          </div>
        </form>
      )}

      {/* Listado */}
      <div>
        <label htmlFor="ficha-busqueda" className="mb-1 block text-sm font-medium text-gray-700">
          Buscar
        </label>
        <input
          id="ficha-busqueda"
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Nombre o teléfono"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 sm:max-w-sm"
        />
      </div>

      {cargando ? (
        <div className="rounded-lg bg-white p-6 text-center shadow">
          <p role="status" aria-live="polite" className="text-sm text-gray-500">
            Cargando clientes…
          </p>
        </div>
      ) : errorCarga ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700">{errorCarga}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Canal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Última compra
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Último contacto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filtrados.map((cliente) => (
                  <tr key={cliente._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-gray-900">{nombreVisible(cliente)}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{cliente.identificador}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {tieneReclamo(cliente) && (
                          <span className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
                            Reclamo abierto
                          </span>
                        )}
                        {(cliente.etiquetas ?? []).map((etiqueta) => (
                          <span
                            key={etiqueta}
                            className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800"
                          >
                            {etiqueta}
                          </span>
                        ))}
                        {cliente.notas && (
                          <span className="inline-flex rounded-full bg-jk-gold/20 px-2 text-xs font-semibold leading-5 text-gray-800">
                            Con notas
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {ETIQUETA_CANAL[cliente.canal] ?? cliente.canal}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {cliente.ultimaCompra?.producto || "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatearFecha(cliente.ultimoContacto)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={(evento) => abrir(cliente, evento.currentTarget)}
                        aria-label={`Abrir la ficha de ${nombreVisible(cliente)}`}
                        disabled={guardando && idEdicion === cliente._id}
                        className="text-gray-900 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Abrir ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtrados.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">
              {clientes.length === 0
                ? "Todavía no hay clientes: las fichas se crean solas cuando alguien le escribe al asesor por WhatsApp."
                : "Ningún cliente coincide con la búsqueda."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
