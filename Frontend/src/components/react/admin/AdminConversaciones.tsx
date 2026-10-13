import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../../../lib/apiBase";
import { adminFetch, ErrorApi, mensajeError, tokenActual } from "./adminApi";

type RolMensaje = "cliente" | "asesor";

interface MensajeConversacion {
  rol: RolMensaje;
  texto: string;
}

/** Una foto que mandó el cliente (bucket privado, se sirve con sesión). */
interface ImagenConversacion {
  archivo: string;
  bytes: number;
  fecha: string;
}

interface ResumenConversacion {
  sessionId: string;
  nombre?: string;
  etiquetas: string[];
  mensajes: number;
  ultimoMensaje: string;
  ultimoRol: RolMensaje;
  ultimaActividad?: string;
  creadaEl: string;
  tieneReclamo: boolean;
}

interface Conversacion extends ResumenConversacion {
  mensajesDetalle: MensajeConversacion[];
  recortada: boolean;
  /** Fotos que mandó el cliente, la más reciente primero. */
  imagenes: ImagenConversacion[];
}

const formatearFecha = (iso?: string): string => {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) return "—";
  return fecha.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Cómo nombrar la sesión: el nombre de la ficha y, si no hay, el teléfono. */
const nombreVisible = (fila: { nombre?: string; sessionId: string }): string =>
  fila.nombre?.trim() || fila.sessionId;

/** Tamaño de archivo legible: se muestran las fotos, no sus bytes crudos. */
const formatearBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Una foto de la conversación.
 *
 * La imagen vive en el bucket privado, así que se pide **con el token y se pinta
 * desde un blob**: una etiqueta `<img src="...">` no puede mandar la cabecera
 * Authorization. El blob se revoca al desmontar para no dejar la imagen en
 * memoria mientras se navega por otras conversaciones.
 */
function FotoCliente({ sessionId, imagen }: { sessionId: string; imagen: ImagenConversacion }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;

    (async () => {
      try {
        const token = tokenActual();
        const res = await fetch(
          `${API_URL}/api/conversaciones/${encodeURIComponent(sessionId)}/imagenes/${encodeURIComponent(imagen.archivo)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!res.ok) throw new Error("No se pudo cargar");
        const blob = await res.blob();
        if (!vivo) return;
        creada = URL.createObjectURL(blob);
        setUrl(creada);
      } catch {
        if (vivo) setError(true);
      }
    })();

    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [sessionId, imagen.archivo]);

  return (
    <figure className="w-[132px]">
      <div className="flex h-[132px] w-[132px] items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {error ? (
          <span className="px-2 text-center text-[11px] text-gray-500">No se pudo cargar</span>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" title="Ver la foto completa">
            <img
              src={url}
              alt={`Foto enviada por el cliente el ${formatearFecha(imagen.fecha)}`}
              className="h-[132px] w-[132px] object-cover transition-opacity hover:opacity-90"
            />
          </a>
        ) : (
          <span className="text-[11px] text-gray-400">Cargando…</span>
        )}
      </div>
      <figcaption className="mt-1 text-[11px] text-gray-500">
        {formatearFecha(imagen.fecha)} · {formatearBytes(imagen.bytes)}
      </figcaption>
    </figure>
  );
}

/**
 * Conversaciones de WhatsApp guardadas en la memoria de n8n.
 *
 * **Solo lectura y solo WhatsApp.** El backend lee `n8n_data.n8n_memory`, que es
 * la colección del canal de WhatsApp (Messenger e Instagram tienen la suya y no
 * se muestran). Desde aquí no se escribe nada: la conversación la lleva n8n.
 *
 * Lo que llega ya viene filtrado por el backend: se descartan los volcados de
 * herramientas (el JSON del catálogo, las respuestas de Meta) y solo quedan los
 * mensajes del cliente y las respuestas del asesor.
 */
export default function AdminConversaciones() {
  const [lista, setLista] = useState<ResumenConversacion[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [abierta, setAbierta] = useState<Conversacion | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const datos = await adminFetch<ResumenConversacion[]>("/api/conversaciones");
        if (!activo) return;
        setLista(datos);
      } catch (error) {
        if (!activo) return;
        // El 401 ya redirige a /login dentro de adminFetch.
        if (error instanceof ErrorApi && error.estado === 401) return;
        setErrorLista(mensajeError(error, "No se pudieron cargar las conversaciones"));
      } finally {
        if (activo) setCargandoLista(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, []);

  const abrir = useCallback(async (sessionId: string) => {
    setCargandoDetalle(true);
    setErrorDetalle(null);
    setAbierta(null);
    try {
      const datos = await adminFetch<Conversacion>(
        `/api/conversaciones/${encodeURIComponent(sessionId)}`
      );
      setAbierta(datos);
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) return;
      setErrorDetalle(mensajeError(error, "No se pudo abrir la conversación"));
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  // Filtro en cliente: son pocas sesiones (una por teléfono que ha escrito) y
  // así el buscador responde por tecla sin ir al backend. Se busca por nombre y
  // por teléfono, que es lo que el equipo tiene a mano.
  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return lista;
    return lista.filter(
      (fila) =>
        nombreVisible(fila).toLowerCase().includes(termino) || fila.sessionId.includes(termino)
    );
  }, [lista, busqueda]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      {/* Lista de conversaciones. En móvil desaparece cuando hay una abierta:
          con dos columnas no caben las dos cosas. */}
      <section
        className={`rounded-lg border border-gray-200 bg-white ${abierta ? "hidden lg:block" : ""}`}
      >
        <div className="border-b border-gray-100 p-4">
          <label htmlFor="buscar-conversacion" className="sr-only">
            Buscar por nombre o teléfono
          </label>
          <input
            id="buscar-conversacion"
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-jk-gold-deep focus:ring-2 focus:ring-jk-gold-deep/30"
          />
          <p className="mt-2 text-xs text-gray-500">
            {cargandoLista
              ? "Cargando…"
              : `${filtradas.length} de ${lista.length} conversaciones · solo WhatsApp`}
          </p>
        </div>

        {errorLista && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorLista}
          </p>
        )}

        {!errorLista && !cargandoLista && lista.length === 0 && (
          <p className="p-4 text-sm text-gray-500">
            Todavía no hay conversaciones guardadas. Se guardan a medida que los clientes escriben
            por WhatsApp.
          </p>
        )}

        <ul className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto">
          {filtradas.map((fila) => {
            const seleccionada = abierta?.sessionId === fila.sessionId;
            return (
              <li key={fila.sessionId}>
                <button
                  type="button"
                  onClick={() => void abrir(fila.sessionId)}
                  aria-current={seleccionada ? "true" : undefined}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    seleccionada ? "bg-jk-cream" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {nombreVisible(fila)}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-gray-500">
                      {formatearFecha(fila.ultimaActividad ?? fila.creadaEl)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500">
                    {fila.sessionId}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                    <span className="text-gray-500">
                      {fila.ultimoRol === "cliente" ? "Cliente: " : "Mobi: "}
                    </span>
                    {fila.ultimoMensaje}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-gray-400">{fila.mensajes} mensajes</span>
                    {fila.tieneReclamo && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Reclamo abierto
                      </span>
                    )}
                    {fila.etiquetas.slice(0, 3).map((etiqueta) => (
                      <span
                        key={etiqueta}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
                      >
                        {etiqueta}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Conversación abierta. */}
      <section
        className={`rounded-lg border border-gray-200 bg-white ${abierta || cargandoDetalle || errorDetalle ? "" : "hidden lg:block"}`}
      >
        {!abierta && !cargandoDetalle && !errorDetalle && (
          <p className="p-8 text-center text-sm text-gray-500">
            Elige una conversación de la lista para leerla completa.
          </p>
        )}

        {cargandoDetalle && <p className="p-8 text-center text-sm text-gray-500">Abriendo…</p>}

        {errorDetalle && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorDetalle}
          </p>
        )}

        {abierta && (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
              <button
                type="button"
                onClick={() => setAbierta(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 lg:hidden"
              >
                ← Volver
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">
                  {nombreVisible(abierta)}
                </h2>
                <p className="font-mono text-xs text-gray-500">{abierta.sessionId}</p>
              </div>
              <div className="ml-auto text-right text-xs text-gray-500">
                <p>{abierta.mensajes} mensajes</p>
                <p>Último contacto: {formatearFecha(abierta.ultimaActividad ?? abierta.creadaEl)}</p>
              </div>
              {abierta.tieneReclamo && (
                <span className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Este cliente tiene un reclamo abierto en su ficha. Revísalo antes de responder.
                </span>
              )}
            </header>

            {/* Las fotos que mandó el cliente. Salen del bucket, así que
                aparecen tanto si eran un comprobante como si eran la foto de un
                mueble para preguntar por él —que es justo el caso que antes no
                se veía en ninguna parte—. */}
            {abierta.imagenes.length > 0 && (
              <section className="border-b border-gray-100 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Fotos que envió este cliente
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Tal como llegaron por WhatsApp, con la fecha de envío. Ábrelas para verlas en
                  grande.
                </p>
                <ul className="mt-3 flex flex-wrap gap-4">
                  {abierta.imagenes.map((imagen) => (
                    <li key={imagen.archivo}>
                      <FotoCliente sessionId={abierta.sessionId} imagen={imagen} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="max-h-[65vh] space-y-2 overflow-y-auto bg-gray-50 p-4">
              {abierta.recortada && (
                <p className="rounded-lg bg-white px-3 py-2 text-center text-xs text-gray-500">
                  La conversación es más larga: se muestran los últimos mensajes.
                </p>
              )}
              {abierta.mensajesDetalle.map((mensaje, indice) => (
                <div
                  key={indice}
                  className={`flex ${mensaje.rol === "cliente" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                      mensaje.rol === "cliente"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "bg-jk-gold/30 text-jk-ink"
                    }`}
                  >
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {mensaje.rol === "cliente" ? "Cliente" : "Mobi (asesor)"}
                    </p>
                    {mensaje.texto}
                  </div>
                </div>
              ))}
            </div>

            <p className="border-t border-gray-100 p-3 text-center text-xs text-gray-500">
              Esta pantalla solo lee: la conversación la lleva el asistente. Para responderle al
              cliente, escríbele por WhatsApp.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
