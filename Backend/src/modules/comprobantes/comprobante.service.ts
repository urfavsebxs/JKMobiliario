import crypto from "crypto";
import {
  Comprobante,
  IComprobante,
  MOTIVOS_RECHAZO,
  NivelAlerta,
  ClaveMotivoRechazo,
  mensajeClienteDeRechazo,
  MENSAJE_APROBADO,
  SALUDO_GENERICO,
} from "../../models/Comprobante";
import { AppError } from "../../middlewares/errorHandler";
import { putPrivateObject, getPrivateObjectStream, statPrivateObject } from "../../config/minio";
import { config } from "../../config";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/** 4MB, igual que el límite de imágenes de producto. */
export const COMPROBANTE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Tipo real del archivo según sus bytes mágicos.
 *
 * No se confía en el `Content-Type` que declare el llamador: es un dato que él
 * controla, y de él depende la extensión con que se guarda el objeto. Mirar los
 * bytes es lo único que garantiza que lo guardado es de verdad una imagen.
 * Devuelve `null` si no es ninguno de los formatos aceptados.
 */
export const detectarMime = (buffer: Buffer): string | null => {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const firmaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (firmaPng.every((byte, i) => buffer[i] === byte)) return "image/png";

  // WebP: "RIFF" ???? "WEBP"
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

/** Extensión de archivo derivada del mime, para nombrar el objeto en MinIO. */
const extensionDeMime = (mime: string): string => {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
};

/**
 * Guarda el binario del comprobante en el bucket privado.
 *
 * La `key` la genera el servidor (nunca el cliente): así un llamador no puede
 * escribir ni leer rutas arbitrarias dentro del bucket.
 */
export const guardarImagen = async (
  buffer: Buffer,
  telefono: string
): Promise<{ key: string; mime: string; bytes: number }> => {
  if (buffer.length === 0) {
    throw createAppError("La imagen llegó vacía", 400);
  }
  if (buffer.length > COMPROBANTE_MAX_BYTES) {
    throw createAppError("La imagen supera el límite de 4MB", 400);
  }

  const mime = detectarMime(buffer);
  if (!mime) {
    throw createAppError("El archivo no es una imagen JPEG, PNG o WebP", 400);
  }

  const telefonoLimpio = telefono.replace(/[^0-9]/g, "").slice(0, 20) || "desconocido";
  const key = `comprobantes/${telefonoLimpio}/${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")}.${extensionDeMime(mime)}`;

  await putPrivateObject(key, buffer, mime);
  return { key, mime, bytes: buffer.length };
};

/**
 * Calcula el nivel de alerta para el revisor humano.
 *
 * IMPORTANTE — alcance real de esto: un modelo de visión NO detecta
 * falsificaciones de forma fiable; puede pasar por alto una bien hecha y
 * marcar una legítima. Por eso esto NO es una detección: es una
 * PRIORIZACIÓN. El trabajador decide siempre, y al cliente nunca se le acusa
 * de nada. Los criterios son deliberadamente conservadores: ante la duda, se
 * marca para revisar.
 */
const calcularAlerta = (datos: {
  monto?: number;
  bancoOrigen?: string;
  referenciaPago?: string;
  fechaPago?: string;
  senalesManipulacion?: string[];
  confianza?: number;
}): { alerta: NivelAlerta; motivoAlerta?: string } => {
  const motivos: string[] = [];
  let alerta: NivelAlerta = "ninguno";

  const senales = datos.senalesManipulacion ?? [];
  if (senales.length > 0) {
    alerta = "urgente";
    motivos.push(`Señales visuales a revisar: ${senales.join("; ")}`);
  }

  // Campos que un comprobante real casi siempre trae. Su ausencia no prueba
  // nada por sí sola (una captura recortada puede perderlos), así que solo
  // sube a "revisar", nunca a "urgente".
  const faltantes: string[] = [];
  if (!datos.referenciaPago) faltantes.push("referencia");
  if (!datos.fechaPago) faltantes.push("fecha");
  if (!datos.bancoOrigen) faltantes.push("banco");
  if (faltantes.length > 0) {
    if (alerta === "ninguno") alerta = "revisar";
    motivos.push(`No se pudieron leer: ${faltantes.join(", ")}`);
  }

  if (typeof datos.monto !== "number" || Number.isNaN(datos.monto)) {
    if (alerta === "ninguno") alerta = "revisar";
    motivos.push("No se pudo leer el monto");
  }

  if (typeof datos.confianza === "number" && datos.confianza < 0.5) {
    alerta = "urgente";
    motivos.push(`Confianza baja del análisis (${datos.confianza.toFixed(2)})`);
  }

  return {
    alerta,
    motivoAlerta: motivos.length > 0 ? motivos.join(". ") : undefined,
  };
};

interface CrearComprobanteDTO {
  telefono: string;
  phoneNumberId?: string;
  imagenKey: string;
  nombreCliente?: string;
  /** Respaldo del perfil de WhatsApp para saludar si el nombre no se leyó. */
  nombrePerfilWhatsApp?: string;
  producto?: string;
  monto?: number;
  bancoOrigen?: string;
  referenciaPago?: string;
  fechaPago?: string;
  datosExtraidos?: Record<string, unknown>;
  senalesManipulacion?: string[];
  confianza?: number;
}

/**
 * Registra un comprobante con los datos que extrajo el modelo de visión.
 * La alerta se calcula aquí, no se acepta del llamador.
 */
export const crearComprobante = async (data: CrearComprobanteDTO): Promise<IComprobante> => {
  // La imagen debe existir en el bucket privado: así un llamador no puede
  // registrar una fila que apunte a un objeto inexistente o ajeno.
  try {
    await statPrivateObject(data.imagenKey);
  } catch {
    throw createAppError("La imagen indicada no existe", 400);
  }

  const { alerta, motivoAlerta } = calcularAlerta({
    monto: data.monto,
    bancoOrigen: data.bancoOrigen,
    referenciaPago: data.referenciaPago,
    fechaPago: data.fechaPago,
    senalesManipulacion: data.senalesManipulacion,
    confianza: data.confianza,
  });

  // La `key` la genera este mismo servidor con una extensión derivada de los
  // bytes mágicos, así que la extensión es de fiar aquí (a diferencia del mime
  // que pudiera declarar el llamador).
  const mime = data.imagenKey.endsWith(".png")
    ? "image/png"
    : data.imagenKey.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  return Comprobante.create({
    telefono: data.telefono,
    phoneNumberId: data.phoneNumberId,
    nombreCliente: data.nombreCliente,
    nombrePerfilWhatsApp: data.nombrePerfilWhatsApp,
    producto: data.producto,
    monto: data.monto,
    bancoOrigen: data.bancoOrigen,
    referenciaPago: data.referenciaPago,
    fechaPago: data.fechaPago,
    imagenKey: data.imagenKey,
    imagenMime: mime,
    estado: "pendiente",
    alerta,
    motivoAlerta,
    datosExtraidos: data.datosExtraidos,
    notificadoCliente: false,
  });
};

/**
 * Lista los comprobantes para el panel.
 * Orden: primero los pendientes, luego por urgencia y por fecha descendente.
 */
export const listarComprobantes = async (estado?: string): Promise<IComprobante[]> => {
  const filtro = estado && ["pendiente", "aprobado", "rechazado"].includes(estado) ? { estado } : {};

  return Comprobante.find(filtro)
    .sort({ estado: 1, alerta: 1, createdAt: -1 })
    .limit(300)
    // `datosExtraidos` puede ser grande y la lista no lo necesita.
    .select("-datosExtraidos");
};

/** Devuelve un comprobante por id (con sus datos extraídos). */
export const obtenerComprobante = async (id: string): Promise<IComprobante> => {
  const comprobante = await Comprobante.findById(id);
  if (!comprobante) {
    throw createAppError("Comprobante no encontrado", 404);
  }
  return comprobante;
};

/**
 * Abre el stream de la imagen de un comprobante.
 * Solo se sirve desde una ruta autenticada; el bucket nunca es público.
 */
export const abrirImagen = async (
  id: string
): Promise<{ stream: NodeJS.ReadableStream; mime: string; size: number }> => {
  const comprobante = await obtenerComprobante(id);
  const stat = await statPrivateObject(comprobante.imagenKey);
  const stream = await getPrivateObjectStream(comprobante.imagenKey);

  return { stream, mime: comprobante.imagenMime, size: stat.size };
};

interface RevisarDTO {
  estado: "aprobado" | "rechazado";
  motivoRechazo?: string;
}

/**
 * Aprueba o rechaza un comprobante. Solo el trabajador/admin llega aquí.
 *
 * No se permite revisar dos veces: una vez resuelto, el estado es final. Así
 * el aviso al cliente se manda una sola vez y no se puede "reabrir" un pago
 * ya aprobado por error.
 */
export const revisarComprobante = async (
  id: string,
  data: RevisarDTO,
  usuarioId: string
): Promise<{ comprobante: IComprobante; mensajeCliente: string }> => {
  const comprobante = await Comprobante.findById(id);
  if (!comprobante) {
    throw createAppError("Comprobante no encontrado", 404);
  }
  if (comprobante.estado !== "pendiente") {
    throw createAppError(
      `Este comprobante ya fue ${comprobante.estado === "aprobado" ? "aprobado" : "rechazado"}`,
      409
    );
  }

  if (data.estado === "rechazado") {
    const clave = data.motivoRechazo as ClaveMotivoRechazo;
    const valido = MOTIVOS_RECHAZO.some((m) => m.clave === clave);
    if (!valido) {
      throw createAppError("Motivo de rechazo no válido", 400);
    }
    comprobante.motivoRechazo = clave;
  }

  comprobante.estado = data.estado;
  comprobante.revisadoPor = usuarioId as unknown as IComprobante["revisadoPor"];
  comprobante.fechaRevision = new Date();
  await comprobante.save();

  // Se devuelve ya el texto que verá el cliente, resuelto aquí contra la lista
  // cerrada, para que el webhook no tenga que conocer las claves internas.
  return {
    comprobante,
    mensajeCliente:
      data.estado === "rechazado"
        ? mensajeClienteDeRechazo(data.motivoRechazo as string)
        : MENSAJE_APROBADO,
  };
};

/**
 * Marca si el aviso al cliente salió bien.
 * Se registra en un campo aparte para poder reintentar la notificación sin
 * tocar el estado de la revisión.
 */
export const marcarNotificado = async (id: string, ok: boolean): Promise<void> => {
  await Comprobante.updateOne({ _id: id }, { $set: { notificadoCliente: ok } });
};

interface AvisoWebhook {
  comprobanteId: string;
  telefono: string;
  /** Necesario para que la plantilla salga del número correcto. */
  phoneNumberId?: string;
  /**
   * Nombre con el que se saluda al cliente. Nunca va vacío: ver
   * `nombreParaSaludo()`. Meta rechaza el envío si el parámetro va vacío.
   */
  nombreCliente: string;
  estado: "aprobado" | "rechazado";
  /** Texto final para el cliente, ya resuelto contra la lista cerrada. */
  mensajeCliente: string;
}

/**
 * Nombre con el que saludar al cliente en la plantilla.
 *
 * Nunca devuelve cadena vacía (ver `SALUDO_GENERICO`): si el comprobante estaba
 * borroso y el modelo no leyó el nombre, se usa el del perfil de WhatsApp, que
 * `Preparar Entrada` ya trae del trigger. Ambos son datos reales del cliente;
 * aquí no se inventa nada.
 */
export const nombreParaSaludo = (comprobante: {
  nombreCliente?: string;
  nombrePerfilWhatsApp?: string;
}): string =>
  comprobante.nombreCliente?.trim() ||
  comprobante.nombrePerfilWhatsApp?.trim() ||
  SALUDO_GENERICO;

/**
 * Avisa a n8n que un comprobante fue revisado, para que el flujo de WhatsApp
 * le mande la plantilla al cliente.
 *
 * Es best-effort y nunca lanza: si n8n está caído, la revisión ya quedó
 * guardada y el cliente simplemente no recibe el aviso (queda
 * `notificadoCliente: false` para poder reintentar). Al llamador le devuelve
 * si el aviso salió, no un error.
 */
export const notificarRevision = async (aviso: AvisoWebhook): Promise<boolean> => {
  if (!config.n8nWebhookUrl) {
    console.warn("[comprobantes] JK_N8N_WEBHOOK_URL no configurada; no se avisa al cliente");
    return false;
  }

  try {
    const respuesta = await fetch(config.n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aviso),
      signal: AbortSignal.timeout(15000),
    });

    if (!respuesta.ok) {
      console.error(`[comprobantes] El webhook respondió ${respuesta.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[comprobantes] No se pudo avisar a n8n:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
};
