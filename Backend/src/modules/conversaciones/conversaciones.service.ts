import mongoose from "mongoose";
import { Cliente } from "../../models/Cliente";
import { normalizarIdentificador } from "../clientes/cliente.service";
import { listPrivateObjects, getPrivateObjectStream, statPrivateObject } from "../../config/minio";
import { AppError } from "../../middlewares/errorHandler";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/**
 * Dónde guarda n8n la memoria de conversación.
 *
 * La base `n8n_data` es la de n8n, no la de la tienda: el backend se conecta al
 * mismo MongoDB, así que se entra por la misma conexión pidiendo esa base. **No
 * se lee la colección `clientes` de la tienda para esto**: la conversación vive
 * aquí y la ficha allí, y este módulo las junta solo para ponerle nombre a la
 * sesión.
 *
 * Hay una colección por canal y **aquí solo se lee la de WhatsApp**:
 * `n8n_memory` (WhatsApp), `n8n_memory_fb` (Messenger), `n8n_memory_ig`
 * (Instagram) y `n8n_test_memory` (pruebas). El nombre de la colección es la
 * única frontera: en los documentos no hay ningún campo que diga de qué canal
 * son, solo `sessionId` y `messages`.
 */
const BD_MEMORIA = "n8n_data";
const COLECCION_WHATSAPP = "n8n_memory";

/** Tope de mensajes que devuelve el detalle: una conversación vieja no puede
 *  tumbar la pantalla, y a partir de cierto punto nadie lee hacia arriba. */
const MAX_MENSAJES = 400;

/** Recorte por mensaje. Los hay de 4 KB (una respuesta larga del asesor). */
const MAX_TEXTO_MENSAJE = 4000;

/** Tope de sesiones listadas. Hoy hay 27; el tope es por si algún día no. */
const MAX_SESIONES = 500;

const coleccionWhatsApp = () =>
  mongoose.connection.getClient().db(BD_MEMORIA).collection(COLECCION_WHATSAPP);

export type RolMensaje = "cliente" | "asesor";

export interface MensajeConversacion {
  rol: RolMensaje;
  texto: string;
}

export interface ResumenConversacion {
  sessionId: string;
  nombre?: string;
  etiquetas: string[];
  /** Mensajes de conversación (cliente + asesor), sin la fontanería de n8n. */
  mensajes: number;
  /** Recorte del último mensaje, para la vista de lista. */
  ultimoMensaje: string;
  ultimoRol: RolMensaje;
  /** Última actividad conocida (de la ficha de cliente, que sí la registra). */
  ultimaActividad?: Date;
  /** Fecha de creación del documento de memoria, como respaldo. */
  creadaEl: Date;
  tieneReclamo: boolean;
}

export interface Conversacion extends ResumenConversacion {
  mensajesDetalle: MensajeConversacion[];
  /** `true` si la conversación es más larga que lo que se devuelve. */
  recortada: boolean;
  /** Imágenes que mandó este cliente (ver `listarImagenes`). */
  imagenes: ImagenConversacion[];
}

/**
 * Una imagen que mandó el cliente.
 *
 * n8n sube al bucket privado **todas** las imágenes que llegan por WhatsApp, bajo
 * `comprobantes/<telefono>/`. Las que resultan ser un pago tienen además su fila
 * en la base; las que no (una foto de referencia de un mueble) quedan solo como
 * objeto. Por eso la lista sale del bucket y no de la tabla de comprobantes:
 * si saliera de la tabla, en el historial no se vería justo la foto que el
 * cliente mandó para preguntar por un mueble.
 */
export interface ImagenConversacion {
  /** Nombre del archivo dentro del prefijo del cliente. */
  archivo: string;
  bytes: number;
  /** Cuándo llegó (fecha del objeto en el bucket). */
  fecha: Date;
}

/**
 * Convierte los mensajes de la memoria de n8n en la conversación que se lee.
 *
 * Se descarta todo lo que no sea una persona hablando:
 *
 * - Los mensajes de tipo `tool` son la salida cruda de las herramientas del
 *   asesor (el JSON del catálogo, la respuesta de Meta al enviar fotos). No son
 *   conversación y son enormes.
 * - Un mensaje de texto que **empieza** por `{` o `[` es un volcado serializado
 *   que se coló como respuesta; tampoco es conversación.
 *
 * Es exactamente el mismo criterio que usa el flujo de n8n para armar el
 * contexto del análisis de comprobantes (`Armar Conversacion`), y por la misma
 * razón: sin el filtro, el volcado se come el espacio de lo que sí importa.
 */
const soloConversacion = (mensajes: unknown): MensajeConversacion[] => {
  if (!Array.isArray(mensajes)) return [];

  const salida: MensajeConversacion[] = [];
  for (const mensaje of mensajes) {
    const m = mensaje as { type?: string; data?: { content?: unknown } };
    if (m?.type !== "human" && m?.type !== "ai") continue;

    const contenido = m.data?.content;
    const texto = typeof contenido === "string" ? contenido.trim() : "";
    if (!texto) continue;
    if (texto.startsWith("{") || texto.startsWith("[")) continue;

    salida.push({
      rol: m.type === "human" ? "cliente" : "asesor",
      texto: texto.length > MAX_TEXTO_MENSAJE ? `${texto.slice(0, MAX_TEXTO_MENSAJE)}…` : texto,
    });
  }
  return salida;
};

/** Fecha de creación de un ObjectId, como respaldo cuando no hay ficha. */
const fechaDelId = (id: unknown): Date => {
  const oid = id as { getTimestamp?: () => Date };
  return typeof oid?.getTimestamp === "function" ? oid.getTimestamp() : new Date(0);
};

/**
 * Prefijo del cliente dentro del bucket de imágenes.
 *
 * Se deriva del `sessionId` con la **misma** normalización que usa el backend al
 * guardar (`guardarImagen` deja solo dígitos y corta a 20), porque si se
 * calculara distinto se buscaría en una carpeta que no existe. Un teléfono de
 * WhatsApp son 12 dígitos; el corte a 20 es para que un BSUID coincida.
 */
const prefijoDelCliente = (sessionId: string): string => {
  const digitos = normalizarIdentificador("whatsapp", sessionId).slice(0, 20);
  return digitos ? `comprobantes/${digitos}/` : "";
};

/**
 * Forma de un archivo de imagen dentro del prefijo del cliente:
 * `<milisegundos>-<hexadecimal>.<extensión>`, tal como los nombra el backend al
 * guardarlos. Se valida antes de tocar el bucket: el nombre llega por la URL y
 * nunca debe poder salirse de la carpeta del cliente (`../`).
 */
const ARCHIVO_IMAGEN = /^\d{10,20}-[0-9a-f]{6,40}\.(jpg|jpeg|png|webp)$/;

/** Mime a partir de la extensión (el archivo lo nombró este mismo servidor). */
const mimeDeArchivo = (archivo: string): string => {
  if (archivo.endsWith(".png")) return "image/png";
  if (archivo.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

/**
 * Imágenes que ha mandado el cliente, la más reciente primero.
 *
 * Nunca lanza por un fallo del bucket: si MinIO no responde, el historial de
 * texto sigue siendo útil y la conversación se muestra sin fotos. Un error aquí
 * dejaría la pantalla en blanco por algo accesorio.
 */
export const listarImagenes = async (sessionId: string): Promise<ImagenConversacion[]> => {
  const prefijo = prefijoDelCliente(sessionId);
  if (!prefijo) return [];

  try {
    const objetos = await listPrivateObjects(prefijo);
    return objetos
      .filter((objeto) => ARCHIVO_IMAGEN.test(objeto.nombre.slice(prefijo.length)))
      .map((objeto) => ({
        archivo: objeto.nombre.slice(prefijo.length),
        bytes: objeto.bytes,
        fecha: objeto.fecha,
      }))
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  } catch (error) {
    console.error(
      "[conversaciones] No se pudieron listar las imágenes:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
};

/**
 * Abre el stream de una imagen del cliente.
 * La clave se arma aquí con el prefijo del cliente y el nombre ya validado: el
 * llamador nunca puede pedir un objeto de otra carpeta.
 */
export const abrirImagen = async (
  sessionId: string,
  archivo: string
): Promise<{ stream: NodeJS.ReadableStream; mime: string; size: number }> => {
  const prefijo = prefijoDelCliente(sessionId);
  if (!prefijo || !ARCHIVO_IMAGEN.test(archivo)) {
    throw createAppError("La imagen indicada no es válida", 400);
  }

  const clave = `${prefijo}${archivo}`;
  try {
    const stat = await statPrivateObject(clave);
    const stream = await getPrivateObjectStream(clave);
    return { stream, mime: mimeDeArchivo(archivo), size: stat.size };
  } catch {
    throw createAppError("La imagen no existe", 404);
  }
};

/** Lo que se aprovecha de la ficha de cliente para dar contexto a la sesión. */
interface FichaResumen {
  nombre?: string;
  nombrePerfil?: string;
  etiquetas?: string[];
  ultimoContacto?: Date;
  reclamo?: { activo?: boolean };
}

/**
 * Cruza las sesiones con las fichas de cliente para ponerles nombre.
 *
 * La memoria de n8n **no guarda el nombre** (solo `sessionId` y `messages`), y
 * el `sessionId` de WhatsApp es un teléfono: sin este cruce, el panel mostraría
 * 27 números. La ficha sí lo tiene, y además es la que sabe cuándo fue el último
 * contacto real (la memoria no guarda fechas por mensaje).
 */
const fichasPorSessionId = async (sessionIds: string[]): Promise<Map<string, FichaResumen>> => {
  const claves = sessionIds.map((id) => normalizarIdentificador("whatsapp", id)).filter(Boolean);
  if (claves.length === 0) return new Map();

  const fichas = await Cliente.find({ canal: "whatsapp", identificador: { $in: claves } })
    .select("identificador nombre nombrePerfil etiquetas ultimoContacto reclamo")
    .lean();

  return new Map(fichas.map((ficha) => [ficha.identificador, ficha]));
};

/**
 * Lista las conversaciones de WhatsApp, la más reciente primero.
 *
 * Ordena por la última actividad de la ficha y, si ese cliente no tiene ficha
 * (escribió y nunca llegó a guardarse), por la fecha de creación del documento
 * de memoria. Así una conversación nunca queda fuera de la lista por no tener
 * ficha.
 */
export const listarConversaciones = async (): Promise<ResumenConversacion[]> => {
  const docs = await coleccionWhatsApp()
    .find({}, { projection: { sessionId: 1, messages: 1 } })
    .sort({ _id: -1 })
    .limit(MAX_SESIONES)
    .toArray();

  const sessionIds = docs.map((doc) => String(doc.sessionId ?? "")).filter(Boolean);
  const fichas = await fichasPorSessionId(sessionIds);

  const lista: ResumenConversacion[] = [];
  for (const doc of docs) {
    const sessionId = String(doc.sessionId ?? "");
    if (!sessionId) continue;

    const mensajes = soloConversacion(doc.messages);
    if (mensajes.length === 0) continue; // Sesión sin nada que leer.

    const ultimo = mensajes[mensajes.length - 1];
    const ficha = fichas.get(normalizarIdentificador("whatsapp", sessionId));

    lista.push({
      sessionId,
      nombre: ficha?.nombre?.trim() || ficha?.nombrePerfil?.trim() || undefined,
      etiquetas: ficha?.etiquetas ?? [],
      mensajes: mensajes.length,
      ultimoMensaje: ultimo.texto.length > 160 ? `${ultimo.texto.slice(0, 160)}…` : ultimo.texto,
      ultimoRol: ultimo.rol,
      ultimaActividad: ficha?.ultimoContacto ?? undefined,
      creadaEl: fechaDelId(doc._id),
      tieneReclamo: ficha?.reclamo?.activo === true,
    });
  }

  return lista.sort((a, b) => {
    const fa = (a.ultimaActividad ?? a.creadaEl).getTime();
    const fb = (b.ultimaActividad ?? b.creadaEl).getTime();
    return fb - fa;
  });
};

/**
 * Devuelve una conversación completa por su `sessionId` (el teléfono).
 *
 * El identificador se valida en la ruta (forma), pero aquí se usa como clave
 * exacta del documento: la memoria de n8n guarda el `waId` tal cual llegó, así
 * que no se normaliza — hacerlo buscaría un documento que no existe.
 */
export const obtenerConversacion = async (sessionId: string): Promise<Conversacion> => {
  const doc = await coleccionWhatsApp().findOne({ sessionId });
  if (!doc) {
    throw createAppError("No hay ninguna conversación con ese identificador", 404);
  }

  const todos = soloConversacion(doc.messages);
  const recortada = todos.length > MAX_MENSAJES;
  const mensajesDetalle = recortada ? todos.slice(-MAX_MENSAJES) : todos;

  const fichas = await fichasPorSessionId([sessionId]);
  const ficha = fichas.get(normalizarIdentificador("whatsapp", sessionId));
  const ultimo = todos[todos.length - 1] ?? { rol: "cliente" as RolMensaje, texto: "" };
  const imagenes = await listarImagenes(sessionId);

  return {
    sessionId,
    nombre: ficha?.nombre?.trim() || ficha?.nombrePerfil?.trim() || undefined,
    etiquetas: ficha?.etiquetas ?? [],
    mensajes: todos.length,
    ultimoMensaje: ultimo.texto,
    ultimoRol: ultimo.rol,
    ultimaActividad: ficha?.ultimoContacto ?? undefined,
    creadaEl: fechaDelId(doc._id),
    tieneReclamo: ficha?.reclamo?.activo === true,
    mensajesDetalle,
    recortada,
    imagenes,
  };
};
