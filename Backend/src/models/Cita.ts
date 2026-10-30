import mongoose, { Document, Schema } from "mongoose";
import { CANALES_CLIENTE, CanalCliente } from "./Cliente";

/** Ciclo de vida de una cita. La crea el asesor virtual; la confirma una persona. */
export const ESTADOS_CITA = ["pendiente", "confirmada", "cancelada"] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

/**
 * Cita de un cliente (colección `citas`).
 *
 * La crea el flujo de WhatsApp cuando el cliente pide una visita a la sala de
 * ventas o una asesoría. Nace `pendiente`: la fecha la propone el cliente, pero
 * quien la confirma es una persona desde el panel, porque el bot no conoce la
 * agenda real de la empresa. Al confirmarla (o al moverle la fecha) se le avisa
 * al cliente por WhatsApp.
 */
export interface ICita extends Document {
  canal: CanalCliente;
  /** Teléfono normalizado (WhatsApp) o PSID/IGSID, igual que en la ficha. */
  identificador: string;
  nombre?: string;
  /** Número de negocio que atendió al cliente: de él sale el aviso. */
  phoneNumberId?: string;
  /** Qué quiere: un mueble concreto, una visita a la sala, una asesoría. */
  motivo: string;
  fecha: Date;
  notas?: string;
  estado: EstadoCita;
  /** Si el último aviso al cliente salió. Se puede reintentar. */
  notificado: boolean;
  /** Texto exacto del último aviso, para auditarlo y reenviarlo tal cual. */
  ultimoAviso?: string;
  createdAt: Date;
  updatedAt: Date;
}

const citaSchema = new Schema<ICita>(
  {
    canal: { type: String, required: true, enum: CANALES_CLIENTE, default: "whatsapp" },
    identificador: { type: String, required: true, trim: true, maxlength: 100 },
    nombre: { type: String, trim: true, maxlength: 200 },
    phoneNumberId: { type: String, trim: true, maxlength: 40 },
    motivo: { type: String, required: true, trim: true, maxlength: 300 },
    fecha: { type: Date, required: true },
    notas: { type: String, trim: true, maxlength: 1000 },
    estado: { type: String, required: true, enum: ESTADOS_CITA, default: "pendiente" },
    notificado: { type: Boolean, default: false },
    ultimoAviso: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// La agenda del panel se lee por fecha; el bot busca la cita viva de un cliente.
citaSchema.index({ fecha: 1, estado: 1 });
citaSchema.index({ canal: 1, identificador: 1, fecha: -1 });

export const Cita = mongoose.model<ICita>("Cita", citaSchema, "citas");
