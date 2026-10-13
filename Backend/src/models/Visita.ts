import mongoose, { Document, Schema } from "mongoose";

/**
 * Tipo de dispositivo del visitante, deducido del User-Agent en el servidor.
 * `desconocido` existe para no mentir: un User-Agent raro o ausente no es
 * "escritorio" por defecto.
 */
export const DISPOSITIVOS = ["movil", "tableta", "escritorio", "desconocido"] as const;
export type Dispositivo = (typeof DISPOSITIVOS)[number];

/**
 * Ventanas de tiempo de los reportes de tráfico. La lista vive aquí (y no en el
 * servicio) porque la comparten el servicio y el esquema de validación de la
 * ruta, igual que `CANALES_CLIENTE` en la ficha de cliente.
 */
export const PERIODOS = ["diario", "semanal", "mensual"] as const;
export type Periodo = (typeof PERIODOS)[number];

/**
 * Una vista de página del sitio público (colección `visitas`).
 *
 * Es la materia prima de los reportes de tráfico del panel. Se guarda en la
 * base propia y no en un servicio externo a propósito: el reporte tiene que
 * vivir dentro del panel, sin depender de una cuenta de terceros ni de un
 * token que caduque.
 *
 * **Qué NO se guarda:** ni la IP, ni el User-Agent, ni ninguna cookie. De la IP
 * y del User-Agent solo queda `visitante`, un hash con sal que cambia cada día
 * (ver `trafico.service.ts`): sirve para contar personas distintas del mismo
 * día, y al día siguiente el mismo visitante es otro número. Sin identificador
 * estable no hay perfil de nadie y no hace falta banner de cookies.
 */
export interface IVisita extends Document {
  /** Día en Colombia (`YYYY-MM-DD`). Se calcula al insertar, no al consultar. */
  fecha: string;
  /** Hora en Colombia (0-23). Permite el reporte diario sin agrupar por fecha. */
  hora: number;
  /** Ruta visitada, tal como aparece en la barra del navegador. */
  ruta: string;
  /**
   * De dónde llegó: el host del `Referer` ("google.com", "instagram.com") o
   * `(directo)` cuando no hay referer o es del propio sitio. Se guarda el host
   * y no la URL completa: la URL de origen puede llevar parámetros de campaña
   * y a veces datos personales de quien la compartió.
   */
  referidor: string;
  dispositivo: Dispositivo;
  /** Hash diario (IP + User-Agent + sal del día). Nunca la IP. */
  visitante: string;
  /** Momento exacto de la visita. */
  ts: Date;
}

const visitaSchema = new Schema<IVisita>({
  fecha: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  hora: { type: Number, required: true, min: 0, max: 23 },
  ruta: { type: String, required: true, trim: true, maxlength: 300 },
  referidor: { type: String, trim: true, maxlength: 120, default: "(directo)" },
  dispositivo: { type: String, enum: DISPOSITIVOS, default: "desconocido" },
  visitante: { type: String, required: true, maxlength: 64 },
  ts: { type: Date, default: Date.now },
});

// Los reportes siempre filtran por rango de días y agrupan por `fecha` u
// `hora`; este índice cubre las dos cosas.
visitaSchema.index({ fecha: 1, hora: 1 });

// Retención: 400 días. Sin esto la colección crece para siempre, y un dato de
// tráfico pierde todo su valor al año. Mongo borra solo (índice TTL).
visitaSchema.index({ ts: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export const Visita = mongoose.model<IVisita>("Visita", visitaSchema, "visitas");
