import { Cliente, ICliente, CanalCliente } from "../../models/Cliente";
import { AppError } from "../../middlewares/errorHandler";

/** Campos que el paso automático de n8n puede escribir. `notas` NO está aquí. */
interface FichaUpsertDTO {
  canal: CanalCliente;
  identificador: string;
  identificadorOriginal?: string;
  nombre?: string;
  nombrePerfil?: string;
  resumen?: string;
  ultimaCompra?: { producto?: string; monto?: number; fecha?: Date };
  reclamo?: { activo?: boolean; detalle?: string; fecha?: Date };
  etiquetas?: string[];
}

/** Campos que el dueño puede corregir desde el panel. */
interface ActualizarClienteDTO {
  nombre?: string;
  etiquetas?: string[];
  notas?: string;
  reclamo?: { activo?: boolean; detalle?: string };
}

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

const esDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

/**
 * Normaliza el identificador de un cliente. **Es la única normalización del
 * sistema y se aplica igual al leer y al escribir**; si se aplicara solo en un
 * lado, guardaríamos una ficha que después no se encontraría.
 *
 * - `whatsapp`: solo dígitos. WhatsApp manda el `wa_id` en formato
 *   internacional sin símbolos (`573229286047`), pero el mismo número puede
 *   llegar como `+57 322 928 6047` desde otra vía, y sin esto serían dos
 *   clientes distintos. Ojo: `Comprobante.telefono` **no** normaliza, así que
 *   la ficha y los comprobantes no casan por esta clave todavía.
 * - `messenger` / `instagram`: el PSID/IGSID tal cual. No son teléfonos y no
 *   hay nada que limpiar; recortarlos los haría inencontrables.
 */
export const normalizarIdentificador = (canal: CanalCliente, valor: string): string => {
  const crudo = (valor ?? "").trim();
  if (canal !== "whatsapp") return crudo;
  return crudo.replace(/[^0-9]/g, "");
};

/**
 * Lista las fichas para el panel, las más recientes primero.
 * Devuelve el documento entero a propósito: el panel abre el detalle desde esta
 * misma lista y necesita `notas`, que es lo que el dueño edita.
 */
export const listarClientes = async (): Promise<ICliente[]> => {
  return Cliente.find().sort({ ultimoContacto: -1, createdAt: -1 }).limit(300);
};

export const obtenerCliente = async (id: string): Promise<ICliente> => {
  const cliente = await Cliente.findById(id);
  if (!cliente) throw createAppError("Cliente no encontrado", 404);
  return cliente;
};

/**
 * GET /api/clientes/ficha (service) — la lectura que hace n8n antes de
 * responder.
 *
 * Devuelve `null` cuando el cliente no tiene ficha, **no un 404**: "este
 * cliente es nuevo" es una respuesta normal y esperada, y un 404 obligaría a
 * n8n a distinguirla de una caída del backend, que es justo lo que no puede
 * hacer.
 *
 * **`notas` se excluye a propósito.** Esta es la lectura que la IA mete en su
 * prompt, y `notas` es el campo privado del dueño. Sin excluirlo, lo que él
 * anota a mano ("no fiar", "devolvió una vez", "es la señora del taller")
 * terminaría dentro del prompt y podría salir en una respuesta al cliente. El
 * panel sí las ve, pero por `obtenerCliente`, que es otra ruta y es de admin.
 */
export const obtenerFicha = async (
  canal: CanalCliente,
  identificador: string
): Promise<ICliente | null> => {
  const clave = normalizarIdentificador(canal, identificador);
  if (!clave) throw createAppError("El identificador es obligatorio", 400);
  return Cliente.findOne({ canal, identificador: clave }).select("-notas");
};

/**
 * POST /api/clientes/ficha (service) — el upsert del paso automático de n8n.
 *
 * **Fusiona, no reemplaza**: solo toca los campos que vienen en el payload. Un
 * `resumen` nuevo no puede borrar un `reclamo` que ya estaba, porque el
 * mensaje de turno casi nunca habla de todo lo que se sabe del cliente.
 *
 * **`notas` no se escribe nunca por aquí.** No está en el DTO y el esquema lo
 * rechaza; es el campo del dueño, y el paso automático corre en cada mensaje,
 * así que si la IA pudiera escribir ahí borraría lo anotado a mano en el
 * siguiente mensaje del cliente.
 */
export const guardarFicha = async (datos: FichaUpsertDTO): Promise<ICliente> => {
  const clave = normalizarIdentificador(datos.canal, datos.identificador);
  if (!clave) throw createAppError("El identificador es obligatorio", 400);

  const set: Record<string, unknown> = { ultimoContacto: new Date() };
  const setOnInsert: Record<string, unknown> = {
    canal: datos.canal,
    identificador: clave,
  };

  if (datos.identificadorOriginal) set.identificadorOriginal = datos.identificadorOriginal;
  if (datos.nombre) set.nombre = datos.nombre;
  if (datos.nombrePerfil) set.nombrePerfil = datos.nombrePerfil;
  if (datos.resumen) set.resumen = datos.resumen;
  if (datos.etiquetas?.length) set.etiquetas = datos.etiquetas;

  // Los subdocumentos se escriben campo a campo: si se asignara el objeto
  // entero, un payload que solo trae el detalle borraría la fecha, y al revés.
  if (datos.ultimaCompra) {
    if (datos.ultimaCompra.producto) set["ultimaCompra.producto"] = datos.ultimaCompra.producto;
    if (datos.ultimaCompra.monto !== undefined) set["ultimaCompra.monto"] = datos.ultimaCompra.monto;
    if (datos.ultimaCompra.fecha) set["ultimaCompra.fecha"] = datos.ultimaCompra.fecha;
  }

  if (datos.reclamo) {
    if (datos.reclamo.detalle) set["reclamo.detalle"] = datos.reclamo.detalle;
    // `activo` solo se toca si el payload lo dice EXPLÍCITAMENTE. Un mensaje
    // que no habla del reclamo no lo resuelve: cerrar un reclamo es una
    // decisión, no un efecto de que el cliente haya escrito de otro tema.
    if (datos.reclamo.activo !== undefined) {
      set["reclamo.activo"] = datos.reclamo.activo;
      if (datos.reclamo.activo) set["reclamo.fecha"] = datos.reclamo.fecha ?? new Date();
    } else if (datos.reclamo.fecha) {
      set["reclamo.fecha"] = datos.reclamo.fecha;
    }
  }

  try {
    const cliente = await Cliente.findOneAndUpdate(
      { canal: datos.canal, identificador: clave },
      {
        $set: set,
        $setOnInsert: setOnInsert,
        $inc: { mensajesTotales: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    return cliente as ICliente;
  } catch (error) {
    // Dos mensajes del mismo cliente a la vez pueden chocar contra el índice
    // único; el segundo pierde la carrera del insert pero la ficha ya existe,
    // así que se reintenta como actualización en vez de devolver un error.
    if (esDuplicateKey(error)) {
      const cliente = await Cliente.findOneAndUpdate(
        { canal: datos.canal, identificador: clave },
        { $set: set, $inc: { mensajesTotales: 1 } },
        { new: true, runValidators: true }
      );
      if (cliente) return cliente;
    }
    throw error;
  }
};

/**
 * PATCH /api/clientes/:id (admin) — la corrección del dueño desde el panel.
 *
 * Esta sí puede escribir `notas`: es exactamente para lo que existe.
 */
export const actualizarCliente = async (
  id: string,
  datos: ActualizarClienteDTO
): Promise<ICliente> => {
  const set: Record<string, unknown> = {};

  if (datos.nombre !== undefined) set.nombre = datos.nombre;
  if (datos.notas !== undefined) set.notas = datos.notas;
  if (datos.etiquetas !== undefined) set.etiquetas = datos.etiquetas;

  if (datos.reclamo) {
    if (datos.reclamo.activo !== undefined) {
      set["reclamo.activo"] = datos.reclamo.activo;
      if (datos.reclamo.activo) set["reclamo.fecha"] = new Date();
    }
    if (datos.reclamo.detalle !== undefined) set["reclamo.detalle"] = datos.reclamo.detalle;
  }

  if (Object.keys(set).length === 0) {
    throw createAppError("No hay nada que actualizar", 400);
  }

  const cliente = await Cliente.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true });
  if (!cliente) throw createAppError("Cliente no encontrado", 404);
  return cliente;
};
