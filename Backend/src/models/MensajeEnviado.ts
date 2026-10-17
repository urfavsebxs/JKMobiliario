import mongoose, { Document, Schema } from "mongoose";
import { CanalCliente, CANALES_CLIENTE } from "./Cliente";

/**
 * Qué se envió. `imagen` es el caso que importa: cuando el cliente responde
 * citando la foto de un mueble, lo que hay que recuperar es de qué mueble era.
 */
export const TIPOS_MENSAJE_ENVIADO = ["texto", "imagen"] as const;
export type TipoMensajeEnviado = (typeof TIPOS_MENSAJE_ENVIADO)[number];

/**
 * Un mensaje que el negocio ya envió (colección `mensajes_enviados`).
 *
 * Existe por una limitación de WhatsApp: cuando el cliente responde citando un
 * mensaje, el webhook solo trae el **id** del mensaje citado (`context.id`), no
 * su contenido. Sin esta tabla, el asesor ve "el cliente respondió a algo" y
 * tiene que adivinar a qué; con ella sabe que respondió a la foto de la Cama
 * Vela y contesta sobre ese mueble sin que el cliente tenga que repetirlo.
 *
 * Se guarda del lado del backend —y no en la memoria del chat— porque la
 * memoria rota cada 15 mensajes y porque la foto la manda un subflujo de n8n
 * que no escribe memoria. Aquí además hay índice TTL, así que la tabla se limpia
 * sola.
 */
export interface IMensajeEnviado extends Document {
  /** `wamid` que devuelve Meta al aceptar el envío. Es la clave que cita el cliente. */
  mensajeId: string;
  canal: CanalCliente;
  /** Misma normalización que la ficha de cliente: en WhatsApp, solo dígitos. */
  identificador: string;
  tipo: TipoMensajeEnviado;
  /** Nombre del producto, cuando el mensaje era la foto de un mueble. */
  producto?: string;
  /** Texto enviado, recortado. Nunca lleva datos de pago ni personales. */
  texto?: string;
  ts: Date;
}

const mensajeEnviadoSchema = new Schema<IMensajeEnviado>({
  mensajeId: { type: String, required: true, trim: true, maxlength: 300 },
  canal: { type: String, enum: CANALES_CLIENTE, required: true },
  identificador: { type: String, required: true, trim: true, maxlength: 64 },
  tipo: { type: String, enum: TIPOS_MENSAJE_ENVIADO, required: true },
  producto: { type: String, trim: true, maxlength: 200 },
  texto: { type: String, trim: true, maxlength: 1000 },
  ts: { type: Date, default: Date.now },
});

// El `wamid` ya es único por sí solo: es lo que identifica al mensaje en Meta.
mensajeEnviadoSchema.index({ mensajeId: 1 }, { unique: true });

// Retención: 30 días. Nadie contesta citando un mensaje de hace un mes, y sin
// esto la tabla crecería con cada foto que manda el asesor para siempre.
mensajeEnviadoSchema.index({ ts: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const MensajeEnviado = mongoose.model<IMensajeEnviado>(
  "MensajeEnviado",
  mensajeEnviadoSchema,
  "mensajes_enviados"
);
