import { Cita, ESTADOS_CITA, EstadoCita, ICita } from "../../models/Cita";
import { CanalCliente } from "../../models/Cliente";
import { normalizarIdentificador } from "../clientes/cliente.service";
import { config } from "../../config";
import { AppError } from "../../middlewares/errorHandler";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/** Zona de la empresa. Sin esto, una cita de las 3 p. m. se avisa como 8 p. m. */
const ZONA = "America/Bogota";

/** Intl cierra la abreviatura con punto ("3:00 p. m."); en la frase sobra. */
const formatearFecha = (fecha: Date): string =>
  new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONA,
  })
    .format(fecha)
    .replace(/\.$/, "");

/** Una cita viva es la que todavía no pasó mucho ni se canceló. */
const VIVA_DESDE = () => new Date(Date.now() - 60 * 60 * 1000);

export interface CitaEntrante {
  canal: CanalCliente;
  identificador: string;
  nombre?: string;
  phoneNumberId?: string;
  motivo: string;
  fecha: Date;
  notas?: string;
}

/**
 * POST /api/citas (service) — la llama el sub-flujo "JK - Agendar Cita".
 *
 * Una sola cita viva por cliente: si ya tiene una pendiente o confirmada, el
 * bot la MUEVE en vez de crear otra, para que "cámbiala para el viernes" no
 * deje dos citas. Al moverla vuelve a `pendiente`, porque la agenda la confirma
 * una persona y el aviso de confirmación fue para la fecha anterior.
 *
 * No avisa al cliente: el cambio se lo acaba de decir el propio bot en el chat.
 */
export const agendarCita = async (
  datos: CitaEntrante
): Promise<{ cita: ICita; actualizada: boolean }> => {
  const clave = normalizarIdentificador(datos.canal, datos.identificador);
  if (!clave) throw createAppError("El identificador es obligatorio", 400);

  const existente = await Cita.findOne({
    canal: datos.canal,
    identificador: clave,
    estado: { $in: ["pendiente", "confirmada"] },
    fecha: { $gte: VIVA_DESDE() },
  });

  if (existente) {
    existente.fecha = datos.fecha;
    existente.motivo = datos.motivo;
    if (datos.nombre) existente.nombre = datos.nombre;
    if (datos.phoneNumberId) existente.phoneNumberId = datos.phoneNumberId;
    if (datos.notas !== undefined) existente.notas = datos.notas;
    existente.estado = "pendiente";
    existente.notificado = false;
    await existente.save();
    return { cita: existente, actualizada: true };
  }

  const cita = await Cita.create({
    canal: datos.canal,
    identificador: clave,
    nombre: datos.nombre,
    phoneNumberId: datos.phoneNumberId,
    motivo: datos.motivo,
    fecha: datos.fecha,
    notas: datos.notas,
    estado: "pendiente",
  });
  return { cita, actualizada: false };
};

/**
 * GET /api/citas — agenda del panel. `estado` opcional; sin él, todo.
 * Se ordena por fecha: lo próximo primero, que es lo que se revisa.
 */
export const listarCitas = async (estado?: string): Promise<ICita[]> => {
  const filtro: Record<string, unknown> = {};
  if (estado && (ESTADOS_CITA as readonly string[]).includes(estado)) {
    filtro.estado = estado;
  }
  return Cita.find(filtro).sort({ fecha: 1 }).limit(500);
};

export interface CambiosCita {
  fecha?: Date;
  estado?: EstadoCita;
  notas?: string;
}

/**
 * PATCH /api/citas/:id — confirmar, mover o cancelar desde el panel.
 *
 * Avisa al cliente SOLO cuando el cambio le importa: cuando la cita queda
 * confirmada, cuando cambia de fecha o cuando se cancela. Guardar una nota
 * interna no manda nada.
 */
export const actualizarCita = async (id: string, cambios: CambiosCita): Promise<ICita> => {
  const cita = await Cita.findById(id);
  if (!cita) throw createAppError("Cita no encontrada", 404);

  const fechaAnterior = cita.fecha.getTime();
  const estadoAnterior = cita.estado;

  if (cambios.fecha) cita.fecha = cambios.fecha;
  if (cambios.estado) cita.estado = cambios.estado;
  if (cambios.notas !== undefined) cita.notas = cambios.notas;
  await cita.save();

  const cambioFecha = cita.fecha.getTime() !== fechaAnterior;
  const seConfirmo = cita.estado === "confirmada" && estadoAnterior !== "confirmada";
  const seCancelo = cita.estado === "cancelada" && estadoAnterior !== "cancelada";

  if (cambioFecha || seConfirmo || seCancelo) {
    const mensaje = textoAviso(cita, seCancelo ? "cancelada" : cambioFecha ? "movida" : "confirmada");
    cita.notificado = await avisarCliente(cita, mensaje);
    cita.ultimoAviso = mensaje;
    await cita.save();
  }

  return cita;
};

type TipoAviso = "confirmada" | "movida" | "cancelada";

/**
 * Nombre con el que saludar. En Instagram no llega ninguno (el webhook solo
 * trae el IGSID), así que sin nombre se saluda sin inventarlo.
 */
const TIENE_LETRAS = /\p{L}/u;

const nombreParaSaludo = (cita: ICita): string => {
  const nombre = cita.nombre?.trim() || "";
  return TIENE_LETRAS.test(nombre) ? nombre : "";
};

/**
 * Texto del aviso. Se arma aquí, junto a la regla que lo dispara, para que todo
 * lo que se le dice al cliente sobre su cita viva en un solo sitio.
 */
const textoAviso = (cita: ICita, tipo: TipoAviso): string => {
  const cuando = formatearFecha(cita.fecha);
  const nombre = nombreParaSaludo(cita);
  const saludo = nombre ? `Hola ${nombre}` : "Hola";

  if (tipo === "cancelada") {
    return `${saludo}, tu cita en JK Mobiliario del ${cuando} fue cancelada. Si quieres, escríbenos por aquí y te ayudamos a agendar otra fecha.`;
  }
  if (tipo === "movida") {
    return `${saludo}, tu cita en JK Mobiliario cambió de fecha: ahora es el ${cuando}. Te esperamos en Carrera 52 #7 Sur-22, Mall Providencia, Medellín. Si esa fecha no te sirve, escríbenos por aquí y la ajustamos.`;
  }
  return `${saludo}, tu cita en JK Mobiliario quedó programada para el ${cuando}. Te esperamos en Carrera 52 #7 Sur-22, Mall Providencia, Medellín. Si necesitas cambiarla, escríbenos por aquí.`;
};

/**
 * Manda el aviso al cliente por el flujo "JK - Notificar Cita".
 *
 * Best-effort, como el aviso de comprobantes: si n8n está caído, la cita queda
 * guardada igual y `notificado` en false. Nota: un texto libre de WhatsApp solo
 * sale si el cliente escribió en las últimas 24 horas; fuera de esa ventana
 * Meta lo rechaza y por eso se devuelve el resultado en vez de suponerlo.
 */
export const avisarCliente = async (cita: ICita, mensaje: string): Promise<boolean> => {
  const url = config.n8nWebhookCita;
  if (!url) {
    console.warn("[citas] JK_N8N_WEBHOOK_URL_CITA no configurada; no se avisa al cliente");
    return false;
  }

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canal: cita.canal,
        telefono: cita.identificador,
        phoneNumberId: cita.phoneNumberId || config.whatsappPhoneNumberId,
        mensaje,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return respuesta.ok;
  } catch (error) {
    console.warn("[citas] el aviso al cliente falló:", error instanceof Error ? error.message : error);
    return false;
  }
};

/** Reintento del aviso desde el panel, sin tocar la fecha ni el estado. */
export const renotificarCita = async (id: string): Promise<ICita> => {
  const cita = await Cita.findById(id);
  if (!cita) throw createAppError("Cita no encontrada", 404);

  const mensaje = cita.ultimoAviso || textoAviso(cita, cita.estado === "cancelada" ? "cancelada" : "confirmada");
  cita.notificado = await avisarCliente(cita, mensaje);
  cita.ultimoAviso = mensaje;
  await cita.save();
  return cita;
};
