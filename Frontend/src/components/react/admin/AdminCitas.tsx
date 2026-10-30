import { useEffect, useState } from "react";
import type { Cita, EstadoCita } from "../../../lib/types";
import { adminFetch, ErrorApi, mensajeError } from "./adminApi";

type Aviso = { tipo: "ok" | "error"; texto: string };

const ESTILO_ESTADO: Record<EstadoCita, { etiqueta: string; clase: string }> = {
  pendiente: { etiqueta: "Pendiente", clase: "bg-blue-100 text-blue-800" },
  confirmada: { etiqueta: "Confirmada", clase: "bg-green-100 text-green-800" },
  cancelada: { etiqueta: "Cancelada", clase: "bg-gray-200 text-gray-700" },
};

const formatearFecha = (iso: string): string => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
};

/**
 * Fecha de la cita en el formato del input `datetime-local`, en hora de
 * Colombia. El input trabaja en la hora del navegador y la cita se guarda en
 * UTC: sin convertir, el asesor movería la cita sin darse cuenta.
 */
const aInputLocal = (iso: string): string => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}`;
};

/**
 * Colombia no tiene horario de verano: el desplazamiento es -05:00 todo el año.
 * Por eso se puede escribir fijo y no hace falta una librería de zonas.
 */
const aIsoColombia = (valorInput: string): string => `${valorInput}:00-05:00`;

const nombreVisible = (cita: Cita): string => {
  const nombre = cita.nombre?.trim() || "";
  return /\p{L}/u.test(nombre) ? nombre : cita.identificador;
};

/**
 * Agenda de citas.
 *
 * Las crea el asesor virtual de WhatsApp; aquí una persona las confirma, las
 * mueve o las cancela. Cada uno de esos tres cambios dispara el aviso al
 * cliente desde el backend. Una cita sin confirmar no avisa nada: el cliente
 * ya sabe la fecha que pidió en el chat, lo que falta es la confirmación.
 */
export default function AdminCitas() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [filtro, setFiltro] = useState<"proximas" | "todas">("proximas");
  /** Fechas editadas en los inputs, por id, antes de guardar. */
  const [fechas, setFechas] = useState<Record<string, string>>({});
  /** id → true mientras su petición está en curso. */
  const [ocupado, setOcupado] = useState<Record<string, boolean>>({});

  const cargar = async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setCitas(await adminFetch<Cita[]>("/api/citas"));
      setFechas({});
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) return;
      setErrorCarga(mensajeError(error, "No se pudieron cargar las citas"));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const guardar = async (id: string, cuerpo: Record<string, unknown>, textoOk: string) => {
    setOcupado((previo) => ({ ...previo, [id]: true }));
    setAviso(null);
    try {
      const cita = await adminFetch<Cita>(`/api/citas/${id}`, {
        method: "PATCH",
        body: JSON.stringify(cuerpo),
      });
      setCitas((previas) => previas.map((c) => (c._id === id ? cita : c)));
      // El aviso es best-effort: si WhatsApp lo rechazó (el cliente no escribió
      // en las últimas 24 h) hay que decirlo, no dar por hecho que llegó.
      setAviso(
        cita.notificado
          ? { tipo: "ok", texto: `${textoOk} y se le avisó al cliente.` }
          : {
              tipo: "error",
              texto: `${textoOk}, pero WhatsApp no dejó enviar el aviso: el cliente debe escribir primero para abrir la ventana de 24 horas.`,
            }
      );
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) return;
      setAviso({ tipo: "error", texto: mensajeError(error, "No se pudo guardar el cambio") });
    } finally {
      setOcupado((previo) => ({ ...previo, [id]: false }));
    }
  };

  const reenviarAviso = async (id: string) => {
    setOcupado((previo) => ({ ...previo, [id]: true }));
    setAviso(null);
    try {
      const cita = await adminFetch<Cita>(`/api/citas/${id}/notificar`, { method: "POST" });
      setCitas((previas) => previas.map((c) => (c._id === id ? cita : c)));
      setAviso(
        cita.notificado
          ? { tipo: "ok", texto: "Aviso enviado al cliente." }
          : { tipo: "error", texto: "WhatsApp sigue rechazando el aviso: el cliente debe escribir primero." }
      );
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) return;
      setAviso({ tipo: "error", texto: mensajeError(error, "No se pudo reenviar el aviso") });
    } finally {
      setOcupado((previo) => ({ ...previo, [id]: false }));
    }
  };

  const ahora = Date.now();
  const visibles = citas.filter((c) =>
    filtro === "todas" ? true : c.estado !== "cancelada" && new Date(c.fecha).getTime() >= ahora - 3600_000
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {(["proximas", "todas"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setFiltro(opcion)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filtro === opcion
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-300 text-gray-900 hover:bg-gray-50"
              }`}
            >
              {opcion === "proximas" ? "Próximas" : "Todas"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Actualizar
        </button>
      </div>

      {aviso && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            aviso.tipo === "ok"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {errorCarga && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{errorCarga}</p>
        </div>
      )}

      {!errorCarga && cargando && <p className="text-gray-500">Cargando citas…</p>}

      {!errorCarga && !cargando && visibles.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No hay citas {filtro === "proximas" ? "próximas" : "registradas"} todavía. Las crea el asesor
          de WhatsApp cuando un cliente pide una visita o una asesoría.
        </div>
      )}

      <div className="space-y-3">
        {visibles.map((cita) => {
          const estado = ESTILO_ESTADO[cita.estado];
          const valorFecha = fechas[cita._id] ?? aInputLocal(cita.fecha);
          const cambioFecha = aIsoColombia(valorFecha) !== new Date(cita.fecha).toISOString();
          const bloqueado = ocupado[cita._id] === true;

          return (
            <div key={cita._id} className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900">{nombreVisible(cita)}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${estado.clase}`}>
                      {estado.etiqueta}
                    </span>
                    {cita.notificado && (
                      <span className="text-xs text-green-700">Aviso enviado</span>
                    )}
                  </div>
                  {cita.canal === "whatsapp" ? (
                    <a
                      href={`https://wa.me/${cita.identificador}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-700 hover:underline"
                    >
                      {cita.identificador}
                    </a>
                  ) : (
                    // En Instagram el identificador es un IGSID: no se lee ni se
                    // puede abrir en wa.me, así que solo se dice el canal.
                    <span className="text-sm text-gray-600">Instagram</span>
                  )}
                  <p className="text-sm text-gray-600 mt-1">{cita.motivo}</p>
                  {cita.notas && <p className="text-sm text-gray-500 mt-1">{cita.notas}</p>}
                  <p className="text-sm text-gray-500 mt-1">
                    Agendada para: <span className="font-medium">{formatearFecha(cita.fecha)}</span>
                  </p>
                </div>

                <div className="flex flex-col items-stretch gap-2">
                  <label className="text-xs text-gray-500" htmlFor={`fecha-${cita._id}`}>
                    Mover a
                  </label>
                  <input
                    id={`fecha-${cita._id}`}
                    type="datetime-local"
                    value={valorFecha}
                    disabled={bloqueado}
                    onChange={(evento) =>
                      setFechas((previas) => ({ ...previas, [cita._id]: evento.target.value }))
                    }
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={bloqueado || !valorFecha || !cambioFecha}
                    onClick={() =>
                      void guardar(cita._id, { fecha: aIsoColombia(valorFecha) }, "Fecha guardada")
                    }
                    className="bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                  >
                    Guardar fecha
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {cita.estado !== "confirmada" && (
                  <button
                    type="button"
                    disabled={bloqueado}
                    onClick={() => void guardar(cita._id, { estado: "confirmada" }, "Cita confirmada")}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40"
                  >
                    Confirmar
                  </button>
                )}
                {cita.estado !== "cancelada" && (
                  <button
                    type="button"
                    disabled={bloqueado}
                    onClick={() => void guardar(cita._id, { estado: "cancelada" }, "Cita cancelada")}
                    className="bg-white border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-40"
                  >
                    Cancelar cita
                  </button>
                )}
                {!cita.notificado && (
                  <button
                    type="button"
                    disabled={bloqueado}
                    onClick={() => void reenviarAviso(cita._id)}
                    className="bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                  >
                    Reenviar aviso
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
