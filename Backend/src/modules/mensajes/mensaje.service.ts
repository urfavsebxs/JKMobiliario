import {
  MensajeEnviado,
  IMensajeEnviado,
  TipoMensajeEnviado,
} from "../../models/MensajeEnviado";
import { CanalCliente } from "../../models/Cliente";
import { AppError } from "../../middlewares/errorHandler";
// Se reutiliza la normalización de la ficha de cliente a propósito: si cada
// módulo normalizara a su manera, un teléfono guardado por aquí no se
// encontraría desde allá. Mismo criterio que `conversaciones.service.ts`.
import { normalizarIdentificador } from "../clientes/cliente.service";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

export interface EnvioRegistrado {
  mensajeId: string;
  canal: CanalCliente;
  identificador: string;
  tipo: TipoMensajeEnviado;
  producto?: string;
  texto?: string;
}

/**
 * POST /api/mensajes/enviado (service) — n8n registra lo que acaba de enviar.
 *
 * Es un `upsert` y no un `insert` porque n8n reintenta: los nodos de envío
 * tienen `retryOnFail`, y un reintento de Meta puede acabar en dos llamadas con
 * el mismo `wamid`. Un duplicado rompería el índice único y, peor, dejaría dos
 * filas para el mismo mensaje citado.
 */
export const registrarEnvio = async (datos: EnvioRegistrado): Promise<void> => {
  const clave = normalizarIdentificador(datos.canal, datos.identificador);
  if (!clave) throw createAppError("El identificador es obligatorio", 400);

  await MensajeEnviado.updateOne(
    { mensajeId: datos.mensajeId },
    {
      $set: {
        canal: datos.canal,
        identificador: clave,
        tipo: datos.tipo,
        ts: new Date(),
        // Un campo ausente se guarda como null en vez de quedarse con el valor
        // anterior: si el reintento ya no trae producto, no debe sobrevivir el
        // de un mensaje distinto que compartiera id.
        producto: datos.producto ?? null,
        texto: datos.texto ?? null,
      },
    },
    { upsert: true }
  );
};

/**
 * GET /api/mensajes/enviado (service) — ¿a qué respondió el cliente?
 *
 * Se filtra también por identificador: el `wamid` viene del webhook y no lo
 * escribe el cliente, pero contestar con la foto que se le mandó **a otro**
 * sería peor que no contestar, así que la consulta no cruza conversaciones.
 * Devuelve `null` cuando el mensaje citado no es de los nuestros (el cliente
 * citó su propio mensaje, o uno anterior a la retención de 30 días).
 */
export const resolverCitado = async (consulta: {
  mensajeId: string;
  canal: CanalCliente;
  identificador: string;
}): Promise<IMensajeEnviado | null> => {
  const clave = normalizarIdentificador(consulta.canal, consulta.identificador);
  if (!clave) return null;

  return MensajeEnviado.findOne({ mensajeId: consulta.mensajeId, identificador: clave });
};
