import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../../../lib/apiBase";
import type { Comprobante, EstadoComprobante, MotivoRechazo, NivelAlerta } from "../../../lib/types";
import { adminFetch, ErrorApi, mensajeError, tokenActual } from "./adminApi";

type Aviso = { tipo: "ok" | "error"; texto: string };

type Filtro = "pendiente" | "aprobado" | "rechazado" | "todos";

/** Etiqueta e color del badge de alerta, de menor a mayor urgencia. */
const ESTILO_ALERTA: Record<NivelAlerta, { etiqueta: string; clase: string }> = {
  ninguno: { etiqueta: "Sin novedad", clase: "bg-green-100 text-green-800" },
  revisar: { etiqueta: "Revisar", clase: "bg-yellow-100 text-yellow-800" },
  urgente: { etiqueta: "Prioritario", clase: "bg-red-100 text-red-800" },
};

const ESTILO_ESTADO: Record<EstadoComprobante, string> = {
  pendiente: "bg-blue-100 text-blue-800",
  aprobado: "bg-green-100 text-green-800",
  rechazado: "bg-gray-200 text-gray-700",
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
 * Pantalla de revisión de comprobantes de pago (rol trabajador).
 *
 * Muestra la lista, y al abrir uno la imagen servida desde el bucket privado
 * junto a los datos que extrajo el análisis. Desde ahí se aprueba o se rechaza
 * con un motivo de la lista; el backend avisa al cliente por WhatsApp.
 */
export default function AdminComprobantes() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");

  const [motivos, setMotivos] = useState<MotivoRechazo[]>([]);

  /** Comprobante abierto en el panel de detalle. */
  const [seleccionado, setSeleccionado] = useState<Comprobante | null>(null);
  /** Blob de la imagen del comprobante seleccionado. */
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [cargandoImagen, setCargandoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);

  /** id → true mientras su PATCH está en curso (evita dobles envíos). */
  const [revisando, setRevisando] = useState<Record<string, boolean>>({});

  // El blob se revoca al cerrar el detalle y al desmontar: si no, cada
  // comprobante visto dejaría la imagen en memoria hasta recargar la página.
  const imagenUrlRef = useRef<string | null>(null);

  const revocarImagen = () => {
    if (imagenUrlRef.current) {
      URL.revokeObjectURL(imagenUrlRef.current);
      imagenUrlRef.current = null;
    }
    setImagenUrl(null);
  };

  useEffect(() => revocarImagen, []);

  const cargar = async (estadoFiltro: Filtro) => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const query = estadoFiltro === "todos" ? "" : `?estado=${estadoFiltro}`;
      const lista = await adminFetch<Comprobante[]>(`/api/comprobantes${query}`);
      setComprobantes(lista);
    } catch (error) {
      // El 401 ya redirige a /login dentro de adminFetch.
      if (error instanceof ErrorApi && error.estado === 401) return;
      setErrorCarga(mensajeError(error, "No se pudieron cargar los comprobantes"));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar(filtro);
    // `filtro` es la única dependencia real: al cambiarlo se vuelve a pedir.
  }, [filtro]);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const lista = await adminFetch<MotivoRechazo[]>("/api/comprobantes/motivos-rechazo");
        if (activo) setMotivos(lista);
      } catch {
        // Sin la lista no se puede rechazar con motivo; el detalle lo avisa.
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const pendientes = useMemo(
    () => comprobantes.filter((c) => c.estado === "pendiente").length,
    [comprobantes]
  );

  /**
   * Trae la imagen con el token y la convierte en blob.
   * Una etiqueta <img> no puede mandar la cabecera Authorization, y la imagen
   * vive en un bucket privado: no hay URL pública que ponerle al `src`.
   */
  const abrirDetalle = async (comprobante: Comprobante) => {
    revocarImagen();
    setSeleccionado(comprobante);
    setMotivoRechazo("");
    setErrorRechazo(null);
    setErrorImagen(null);
    setCargandoImagen(true);

    try {
      const token = tokenActual();
      const res = await fetch(`${API_URL}/api/comprobantes/${comprobante._id}/imagen`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        setErrorImagen("No se pudo cargar la imagen del comprobante.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      imagenUrlRef.current = url;
      setImagenUrl(url);
    } catch {
      setErrorImagen("No se pudo cargar la imagen del comprobante.");
    } finally {
      setCargandoImagen(false);
    }
  };

  const cerrarDetalle = () => {
    revocarImagen();
    setSeleccionado(null);
    setMotivoRechazo("");
    setErrorRechazo(null);
  };

  const revisar = async (comprobante: Comprobante, estado: "aprobado" | "rechazado") => {
    if (estado === "rechazado" && !motivoRechazo) {
      setErrorRechazo("Elige un motivo para el rechazo.");
      return;
    }

    const confirmacion =
      estado === "aprobado"
        ? `¿Aprobar el pago de ${comprobante.nombreCliente || comprobante.telefono}? Se le avisará por WhatsApp.`
        : `¿Rechazar el comprobante de ${comprobante.nombreCliente || comprobante.telefono}? Se le avisará por WhatsApp con el motivo.`;
    if (!window.confirm(confirmacion)) return;

    setAviso(null);
    setRevisando((prev) => ({ ...prev, [comprobante._id]: true }));

    try {
      const actualizado = await adminFetch<Comprobante>(`/api/comprobantes/${comprobante._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          estado,
          ...(estado === "rechazado" ? { motivoRechazo } : {}),
        }),
      });

      setComprobantes((prev) =>
        prev.map((c) => (c._id === actualizado._id ? { ...c, ...actualizado } : c))
      );
      cerrarDetalle();

      const avisoCliente = actualizado.notificadoCliente
        ? " Se avisó al cliente por WhatsApp."
        : " No se pudo avisar al cliente por WhatsApp: escríbele tú directamente. (La revisión ya quedó guardada y no se puede repetir.)";
      setAviso({
        tipo: actualizado.notificadoCliente ? "ok" : "error",
        texto: `${estado === "aprobado" ? "Comprobante aprobado." : "Comprobante rechazado."}${avisoCliente}`,
      });

      // En la pestaña "pendiente" la fila ya no corresponde a este filtro.
      if (filtro === "pendiente") {
        setComprobantes((prev) => prev.filter((c) => c._id !== actualizado._id));
      }
    } catch (error) {
      // 409 (ya revisado por otro) y 400 (motivo inválido): mensaje del backend.
      const texto = mensajeError(error, "Error al guardar la revisión");
      if (seleccionado) setErrorRechazo(texto);
      setAviso({ tipo: "error", texto });
    } finally {
      setRevisando((prev) => {
        const copia = { ...prev };
        delete copia[comprobante._id];
        return copia;
      });
    }
  };

  const FILTROS: Array<{ valor: Filtro; etiqueta: string }> = [
    { valor: "pendiente", etiqueta: "Pendientes" },
    { valor: "aprobado", etiqueta: "Aprobados" },
    { valor: "rechazado", etiqueta: "Rechazados" },
    { valor: "todos", etiqueta: "Todos" },
  ];

  return (
    <div className="space-y-6">
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

      {/* Detalle: se abre encima de la lista para no perder el contexto. */}
      {seleccionado && (
        <div className="rounded-lg border-2 border-jk-gold/60 bg-white p-4 shadow sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {seleccionado.nombreCliente || "Cliente sin nombre"}
              </h2>
              <p className="text-sm text-gray-500">
                {seleccionado.telefono} · recibido el {formatearFecha(seleccionado.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={cerrarDetalle}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Imagen */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Comprobante</h3>
              {cargandoImagen ? (
                <p role="status" aria-live="polite" className="text-sm text-gray-500">
                  Cargando imagen…
                </p>
              ) : errorImagen ? (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorImagen}
                </p>
              ) : imagenUrl ? (
                <a href={imagenUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={imagenUrl}
                    alt={`Comprobante de ${seleccionado.nombreCliente || seleccionado.telefono}`}
                    className="max-h-[28rem] w-full rounded-lg border border-gray-200 object-contain"
                  />
                </a>
              ) : (
                <p className="text-sm text-gray-400">Sin imagen.</p>
              )}
            </div>

            {/* Datos + decisión */}
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Datos leídos</h3>
                <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
                  {[
                    ["Monto", formatearMonto(seleccionado.monto)],
                    ["Banco", seleccionado.bancoOrigen || "—"],
                    ["Referencia", seleccionado.referenciaPago || "—"],
                    ["Fecha del pago", seleccionado.fechaPago || "—"],
                    ["Producto", seleccionado.producto || "—"],
                  ].map(([etiqueta, valor]) => (
                    <div key={etiqueta} className="flex justify-between gap-4 px-3 py-2">
                      <dt className="text-gray-500">{etiqueta}</dt>
                      <dd className="text-right font-medium text-gray-900">{valor}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  seleccionado.alerta === "urgente"
                    ? "bg-red-50 text-red-800"
                    : seleccionado.alerta === "revisar"
                      ? "bg-yellow-50 text-yellow-800"
                      : "bg-green-50 text-green-800"
                }`}
              >
                <p className="font-medium">
                  Alerta: {ESTILO_ALERTA[seleccionado.alerta].etiqueta}
                </p>
                <p className="mt-1">
                  {seleccionado.motivoAlerta ||
                    "El análisis no encontró señales que revisar. Aun así, verifica el pago antes de aprobar."}
                </p>
                <p className="mt-2 text-xs opacity-80">
                  Esto es solo una priorización automática: no confirma ni descarta nada. La decisión es tuya.
                </p>
              </div>

              {seleccionado.estado !== "pendiente" ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Ya fue {seleccionado.estado} el {formatearFecha(seleccionado.fechaRevision)}
                  {seleccionado.motivoRechazo
                    ? ` · motivo: ${
                        motivos.find((m) => m.clave === seleccionado.motivoRechazo)?.etiqueta ??
                        seleccionado.motivoRechazo
                      }`
                    : ""}
                  .
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="motivo-rechazo"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Motivo (solo si rechazas)
                    </label>
                    <select
                      id="motivo-rechazo"
                      value={motivoRechazo}
                      onChange={(evento) => {
                        setMotivoRechazo(evento.target.value);
                        if (errorRechazo) setErrorRechazo(null);
                      }}
                      disabled={Boolean(revisando[seleccionado._id])}
                      aria-invalid={Boolean(errorRechazo)}
                      aria-describedby={errorRechazo ? "motivo-rechazo-error" : undefined}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
                    >
                      <option value="">— Elige un motivo —</option>
                      {motivos.map((motivo) => (
                        <option key={motivo.clave} value={motivo.clave}>
                          {motivo.etiqueta}
                        </option>
                      ))}
                    </select>
                    {errorRechazo && (
                      <p id="motivo-rechazo-error" role="alert" className="mt-1 text-xs text-red-600">
                        {errorRechazo}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void revisar(seleccionado, "aprobado")}
                      disabled={Boolean(revisando[seleccionado._id])}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {revisando[seleccionado._id] ? "Guardando…" : "Aprobar pago"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void revisar(seleccionado, "rechazado")}
                      disabled={Boolean(revisando[seleccionado._id])}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => setFiltro(opcion.valor)}
            aria-pressed={filtro === opcion.valor}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filtro === opcion.valor
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {opcion.etiqueta}
            {opcion.valor === "pendiente" && pendientes > 0 ? ` (${pendientes})` : ""}
          </button>
        ))}
      </div>

      {/* Listado */}
      {cargando ? (
        <div className="rounded-lg bg-white p-6 text-center shadow">
          <p role="status" aria-live="polite" className="text-sm text-gray-500">
            Cargando comprobantes…
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
                  {["Cliente", "Monto", "Producto", "Recibido", "Alerta", "Estado", ""].map(
                    (titulo, indice) => (
                      <th
                        key={titulo || indice}
                        className={`px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${
                          indice === 6 ? "text-right" : "text-left"
                        }`}
                      >
                        {titulo}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {comprobantes.map((comprobante) => (
                  <tr
                    key={comprobante._id}
                    className={`hover:bg-gray-50 ${
                      comprobante.alerta === "urgente" && comprobante.estado === "pendiente"
                        ? "bg-red-50/40"
                        : ""
                    }`}
                  >
                    <td className="px-6 py-4 text-sm">
                      <p className="font-medium text-gray-900">
                        {comprobante.nombreCliente || "Sin nombre"}
                      </p>
                      <p className="text-gray-500">{comprobante.telefono}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {formatearMonto(comprobante.monto)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {comprobante.producto || "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatearFecha(comprobante.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          ESTILO_ALERTA[comprobante.alerta].clase
                        }`}
                      >
                        {ESTILO_ALERTA[comprobante.alerta].etiqueta}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          ESTILO_ESTADO[comprobante.estado]
                        }`}
                      >
                        {comprobante.estado}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => void abrirDetalle(comprobante)}
                        aria-label={`Revisar comprobante de ${
                          comprobante.nombreCliente || comprobante.telefono
                        }`}
                        className="text-gray-900 transition-colors hover:text-gray-600"
                      >
                        {comprobante.estado === "pendiente" ? "Revisar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comprobantes.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">
              {filtro === "pendiente"
                ? "No hay comprobantes pendientes de revisión."
                : "No hay comprobantes en este filtro."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
