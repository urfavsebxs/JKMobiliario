import mongoose, { Document, Schema, Types } from "mongoose";

/** Niveles de prioridad para el revisor humano, de menor a mayor urgencia. */
export const NIVELES_ALERTA = ["ninguno", "revisar", "urgente"] as const;
export type NivelAlerta = (typeof NIVELES_ALERTA)[number];

/** Estados del ciclo de vida de un comprobante. */
export const ESTADOS_COMPROBANTE = ["pendiente", "aprobado", "rechazado"] as const;
export type EstadoComprobante = (typeof ESTADOS_COMPROBANTE)[number];

/**
 * Motivos de rechazo que el cliente recibe por WhatsApp.
 *
 * Es una lista cerrada a propósito: el motivo viaja en un mensaje al cliente,
 * así que no puede ser texto libre escrito por el trabajador (riesgo de filtrar
 * datos internos o de redactar algo inapropiado en nombre de la empresa).
 * La `clave` es lo que se guarda; `etiqueta` es lo que ve el trabajador y
 * `mensajeCliente` lo que se envía.
 */
export const MOTIVOS_RECHAZO = [
  {
    clave: "ilegible",
    etiqueta: "El comprobante no se lee bien",
    mensajeCliente:
      "no pudimos leer bien el comprobante. ¿Nos lo puedes enviar de nuevo, por favor?",
  },
  {
    clave: "monto_no_coincide",
    etiqueta: "El monto no coincide con el pedido",
    mensajeCliente:
      "el monto del comprobante no coincide con el valor de tu pedido. Un asesor te contactará para revisarlo.",
  },
  {
    clave: "pago_no_encontrado",
    etiqueta: "No se encontró el pago",
    mensajeCliente:
      "no encontramos el pago en nuestra cuenta. Si ya lo realizaste, envíanos el comprobante de nuevo o un asesor te ayudará.",
  },
  {
    clave: "duplicado",
    etiqueta: "Ya se había registrado este pago",
    mensajeCliente:
      "este comprobante ya lo teníamos registrado. Si crees que es un error, un asesor te contactará.",
  },
  {
    clave: "otro",
    etiqueta: "Otro motivo",
    mensajeCliente:
      "necesitamos revisar tu comprobante con más detalle. Un asesor te contactará pronto.",
  },
] as const;

export type ClaveMotivoRechazo = (typeof MOTIVOS_RECHAZO)[number]["clave"];

/**
 * Texto que recibe el cliente cuando su pago queda aprobado.
 * Se redacta aquí, junto a los motivos de rechazo, para que todo lo que se le
 * dice al cliente sobre su pago viva en un solo sitio revisable.
 */
export const MENSAJE_APROBADO =
  "tu pago fue aprobado. Ya empezamos a preparar tu pedido; te avisaremos cuando esté listo para envío o recogida.";

export interface IDatosExtraidos {
  /** JSON crudo que devolvió el modelo de visión; se conserva para auditar. */
  [key: string]: unknown;
}

export interface IComprobante extends Document {
  /** Fecha en que el comprobante llegó por WhatsApp. */
  fecha: Date;
  /** `wa_id` del cliente, tal como lo entrega WhatsApp (con código de país). */
  telefono: string;
  /**
   * `phone_number_id` del número de negocio que recibió el comprobante.
   * Se guarda porque el aviso de vuelta al cliente se manda como plantilla, y
   * ese envío necesita saber desde qué número sale. Sin este dato habría que
   * fijar el id a mano en n8n.
   */
  phoneNumberId?: string;
  nombreCliente?: string;
  /** Respaldo para el saludo; viene del perfil de WhatsApp, no del modelo. */
  nombrePerfilWhatsApp?: string;
  /** Producto o pedido al que el cliente asocia el pago. */
  producto?: string;
  monto?: number;
  bancoOrigen?: string;
  referenciaPago?: string;
  /** Fecha del pago tal como aparece en el comprobante (texto libre). */
  fechaPago?: string;
  /** Object key en el bucket PRIVADO. Nunca una URL pública. */
  imagenKey: string;
  imagenMime: string;
  estado: EstadoComprobante;
  alerta: NivelAlerta;
  motivoAlerta?: string;
  datosExtraidos?: IDatosExtraidos;
  revisadoPor?: Types.ObjectId;
  fechaRevision?: Date;
  motivoRechazo?: ClaveMotivoRechazo;
  /** true cuando el webhook a n8n confirmó el aviso al cliente. */
  notificadoCliente: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const comprobanteSchema = new Schema<IComprobante>(
  {
    fecha: { type: Date, default: () => new Date() },
    telefono: { type: String, required: true, trim: true, index: true },
    phoneNumberId: { type: String, trim: true },
    nombreCliente: { type: String, trim: true, maxlength: 200 },
    /**
     * Nombre del perfil de WhatsApp de quien envió la imagen. Respaldo para
     * saludar al cliente en la plantilla cuando el comprobante es ilegible y
     * `nombreCliente` quedó vacío. Lo manda `Preparar Entrada`, no el modelo.
     */
    nombrePerfilWhatsApp: { type: String, trim: true, maxlength: 200 },
    producto: { type: String, trim: true, maxlength: 300 },
    monto: { type: Number, min: 0 },
    bancoOrigen: { type: String, trim: true, maxlength: 100 },
    referenciaPago: { type: String, trim: true, maxlength: 200 },
    fechaPago: { type: String, trim: true, maxlength: 100 },
    imagenKey: { type: String, required: true },
    imagenMime: { type: String, default: "image/jpeg" },
    estado: { type: String, enum: ESTADOS_COMPROBANTE, default: "pendiente", index: true },
    alerta: { type: String, enum: NIVELES_ALERTA, default: "ninguno" },
    motivoAlerta: { type: String, maxlength: 1000 },
    datosExtraidos: { type: Schema.Types.Mixed },
    revisadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    fechaRevision: { type: Date },
    motivoRechazo: { type: String, enum: MOTIVOS_RECHAZO.map((m) => m.clave) },
    notificadoCliente: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// El panel lista primero lo pendiente y, dentro de eso, lo más urgente y
// reciente. Este índice compuesto cubre ese orden sin ordenar en memoria.
comprobanteSchema.index({ estado: 1, alerta: 1, createdAt: -1 });

export const Comprobante = mongoose.model<IComprobante>(
  "Comprobante",
  comprobanteSchema,
  "comprobantes"
);

/** Texto que se le envía al cliente para un motivo de rechazo dado. */
export const mensajeClienteDeRechazo = (clave: string): string =>
  MOTIVOS_RECHAZO.find((m) => m.clave === clave)?.mensajeCliente ??
  MOTIVOS_RECHAZO[MOTIVOS_RECHAZO.length - 1].mensajeCliente;

/**
 * Saludo con el que arranca la plantilla cuando no hay nombre que usar.
 *
 * Existe porque Meta **rechaza** el envío si un parámetro de la plantilla va
 * vacío (error 132000). El nombre sale de lo que el modelo de visión alcance a
 * leer en la imagen, y `nombreCliente` es opcional de punta a punta: en un
 * comprobante borroso —justo los que acaban en rechazo por "ilegible"— puede
 * no haber ninguno. Sin esto, el cliente con el comprobante más difícil de leer
 * sería el único que nunca se enteraría de que se le revisó el pago.
 */
export const SALUDO_GENERICO = "Hola";
