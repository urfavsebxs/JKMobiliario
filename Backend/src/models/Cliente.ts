import mongoose, { Document, Schema } from "mongoose";

/**
 * Canales por los que un cliente puede escribir. Cada flujo de n8n tiene su
 * propia memoria de conversación, así que la ficha también tiene que
 * distinguirlos: un mismo teléfono y un PSID de Messenger son dos personas
 * distintas para el sistema.
 */
export const CANALES_CLIENTE = ["whatsapp", "messenger", "instagram"] as const;
export type CanalCliente = (typeof CANALES_CLIENTE)[number];

/** Última compra conocida del cliente. Solo la última: no hay historial. */
export interface IUltimaCompra {
  producto?: string;
  monto?: number;
  fecha?: Date;
}

/**
 * Reclamo abierto del cliente. `activo` existe para poder saber si hay un
 * reclamo sin releer el texto, y para que un mensaje que no hable del tema no
 * lo cierre solo.
 */
export interface IReclamo {
  activo: boolean;
  detalle?: string;
  fecha?: Date;
}

/**
 * Ficha de un cliente (colección `clientes`).
 *
 * Es lo que permite que el asesor recuerde a quien vuelve a escribir. La
 * memoria de conversación solo guarda los últimos 15 mensajes de ese teléfono,
 * así que lo que el cliente dijo al principio —su nombre, que venía por un
 * reclamo— se cae de la ventana. La ficha es un resumen que sobrevive.
 *
 * La escribe el paso automático de n8n después de responder (por eso `notas`
 * queda fuera de esa ruta: es el campo donde el dueño escribe a mano).
 */
export interface ICliente extends Document {
  canal: CanalCliente;
  /**
   * Clave de la ficha, ya normalizada. En WhatsApp son solo dígitos; en
   * Messenger e Instagram, el PSID/IGSID tal cual. La normalización la hace
   * `normalizarIdentificador` y se aplica igual al leer y al escribir.
   */
  identificador: string;
  /**
   * El identificador crudo, tal como llegó. Sin él, un fallo de normalización
   * es indepurable: no habría con qué comparar lo guardado.
   */
  identificadorOriginal?: string;
  /** Nombre del cliente (el que dio, o el de su perfil). */
  nombre?: string;
  /** Nombre del perfil de WhatsApp (`contacts[0].profile.name`). */
  nombrePerfil?: string;
  /** Dos o tres líneas de quién es y qué quiere. Es lo que lee el asesor. */
  resumen?: string;
  ultimaCompra?: IUltimaCompra;
  reclamo?: IReclamo;
  /** Etiquetas cortas ("mayorista", "pide factura"). */
  etiquetas: string[];
  /**
   * Notas del dueño. **Nunca las escribe n8n**: el upsert de servicio no acepta
   * este campo, para que el paso automático no borre lo que se anotó a mano.
   */
  notas?: string;
  /** Para ordenar la lista del panel por actividad reciente. */
  ultimoContacto?: Date;
  mensajesTotales: number;
  createdAt: Date;
  updatedAt: Date;
}

const ultimaCompraSchema = new Schema<IUltimaCompra>(
  {
    producto: { type: String, trim: true, maxlength: 300 },
    monto: { type: Number, min: 0 },
    fecha: { type: Date },
  },
  { _id: false }
);

const reclamoSchema = new Schema<IReclamo>(
  {
    activo: { type: Boolean, default: false },
    detalle: { type: String, trim: true, maxlength: 1000 },
    fecha: { type: Date },
  },
  { _id: false }
);

const clienteSchema = new Schema<ICliente>(
  {
    canal: { type: String, required: true, enum: CANALES_CLIENTE },
    identificador: { type: String, required: true, trim: true, maxlength: 100 },
    identificadorOriginal: { type: String, trim: true, maxlength: 100 },
    nombre: { type: String, trim: true, maxlength: 200 },
    nombrePerfil: { type: String, trim: true, maxlength: 200 },
    resumen: { type: String, trim: true, maxlength: 1000 },
    ultimaCompra: { type: ultimaCompraSchema },
    reclamo: { type: reclamoSchema },
    etiquetas: { type: [String], default: [] },
    notas: { type: String, trim: true, maxlength: 2000 },
    ultimoContacto: { type: Date },
    mensajesTotales: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Índice único compuesto: es lo que garantiza que el upsert del paso automático
// no cree dos fichas del mismo cliente si dos mensajes entran a la vez. El
// service traduce el error 11000 a 409, como hace category.service.ts.
//
// Compuesto y no solo `identificador` porque un PSID de Messenger y un teléfono
// de WhatsApp pueden coincidir en forma sin ser la misma persona.
clienteSchema.index({ canal: 1, identificador: 1 }, { unique: true });

// La lista del panel se ordena por actividad reciente.
clienteSchema.index({ ultimoContacto: -1 });

export const Cliente = mongoose.model<ICliente>("Cliente", clienteSchema, "clientes");
