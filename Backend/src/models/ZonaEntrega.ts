import mongoose, { Document, Schema } from "mongoose";

/**
 * Los 32 departamentos de Colombia más Bogotá D.C.
 *
 * La lista vive aquí, y no en el servicio, porque la comparten el sembrado, la
 * validación y el panel: si estuviera en dos sitios, un departamento nuevo en
 * uno y no en el otro daría una zona que el panel no puede mostrar.
 */
export const DEPARTAMENTOS_COLOMBIA = [
  "Amazonas",
  "Antioquia",
  "Arauca",
  "Atlántico",
  "Bolívar",
  "Boyacá",
  "Caldas",
  "Caquetá",
  "Casanare",
  "Cauca",
  "Cesar",
  "Chocó",
  "Córdoba",
  "Cundinamarca",
  "Guainía",
  "Guaviare",
  "Huila",
  "La Guajira",
  "Magdalena",
  "Meta",
  "Nariño",
  "Norte de Santander",
  "Putumayo",
  "Quindío",
  "Risaralda",
  "San Andrés y Providencia",
  "Santander",
  "Sucre",
  "Tolima",
  "Valle del Cauca",
  "Vaupés",
  "Vichada",
  "Bogotá D.C.",
] as const;

export type Departamento = (typeof DEPARTAMENTOS_COLOMBIA)[number];

/**
 * Zona de entrega (colección `zonas_entrega`).
 *
 * Es la respuesta a "¿llegamos hasta allá?". El asesor de WhatsApp pregunta la
 * ciudad y el barrio, y consulta esta colección antes de seguir con la venta; el
 * dueño la administra desde el panel.
 *
 * **Es jerárquica y cada fila es una regla**, del sitio más grande al más
 * pequeño:
 *
 *   - `{ Antioquia, "", "" }`        → todo el departamento.
 *   - `{ Antioquia, Medellín, "" }`  → todo Medellín.
 *   - `{ Antioquia, Medellín, Belén }` → solo el barrio Belén.
 *
 * Gana SIEMPRE la regla más específica que se reconozca en lo que escribió el
 * cliente. Así el dueño no tiene que desactivar un departamento entero para
 * dejar de ir a un barrio: agrega la fila del barrio y la apaga.
 *
 * Los municipios y los barrios los agrega el dueño desde el panel (en Colombia
 * hay más de mil municipios y decenas de miles de barrios: no hay lista que
 * sembrar). Los 33 departamentos sí vienen sembrados, todos activos, porque el
 * negocio ya repartía a nivel nacional antes de que existiera esta tabla.
 */
export interface IZonaEntrega extends Document {
  departamento: string;
  /** Vacío significa "todo el departamento". */
  municipio: string;
  /** Vacío significa "todo el municipio". */
  barrio: string;
  /** Si el mueble se puede enviar o entregar allí. */
  activo: boolean;
  /**
   * Anotación interna del dueño (por ejemplo "solo hasta las 5 p.m." o "flete
   * alto"). NUNCA se le muestra al cliente ni llega al prompt del asesor: es el
   * mismo trato que las `notas` de la ficha de cliente.
   */
  nota?: string;
  createdAt: Date;
  updatedAt: Date;
}

const zonaEntregaSchema = new Schema<IZonaEntrega>(
  {
    departamento: { type: String, required: true, trim: true, maxlength: 80 },
    // Cadena vacía, no `undefined`: el índice único tiene que poder cubrir las
    // tres columnas, y Mongo indexa los campos ausentes como null, que es un
    // valor distinto de "" y dejaría pasar filas duplicadas.
    municipio: { type: String, trim: true, maxlength: 120, default: "" },
    barrio: { type: String, trim: true, maxlength: 120, default: "" },
    activo: { type: Boolean, default: true },
    nota: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

// Una regla por lugar. El índice es único porque el sembrado, el panel y el
// asesor escriben con `upsert`: sin él, dos peticiones simultáneas crearían dos
// filas del mismo barrio y el asesor recibiría dos respuestas contradictorias.
zonaEntregaSchema.index({ departamento: 1, municipio: 1, barrio: 1 }, { unique: true });

export const ZonaEntrega = mongoose.model<IZonaEntrega>(
  "ZonaEntrega",
  zonaEntregaSchema,
  "zonas_entrega"
);
