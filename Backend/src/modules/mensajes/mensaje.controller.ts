import { Request, Response, NextFunction } from "express";
import * as mensajeService from "./mensaje.service";
import { CanalCliente } from "../../models/Cliente";
import { TipoMensajeEnviado } from "../../models/MensajeEnviado";

/**
 * POST /api/mensajes/enviado (servicio: la llama n8n)
 *
 * Responde 201 sin cuerpo útil: n8n no lee la respuesta, solo necesita que el
 * registro quede. Se contesta rápido porque el subflujo de la galería lo llama
 * una vez por foto, dentro del bucle de envío.
 */
export const registrar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await mensajeService.registrarEnvio(req.body);
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/mensajes/enviado?mensajeId=...&canal=...&identificador=...
 * (servicio: la llama n8n al recibir una respuesta citada)
 *
 * `data: null` cuando el mensaje citado no es de los nuestros. Es un 200 y no
 * un 404 a propósito: para el asesor, "no sé a qué respondió" es un dato
 * válido y frecuente (el cliente citó su propio mensaje), no un error.
 */
export const citado = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mensaje = await mensajeService.resolverCitado({
      mensajeId: req.query.mensajeId as string,
      canal: req.query.canal as CanalCliente,
      identificador: req.query.identificador as string,
    });

    res.status(200).json({
      success: true,
      data: mensaje
        ? {
            tipo: mensaje.tipo as TipoMensajeEnviado,
            producto: mensaje.producto ?? "",
            texto: mensaje.texto ?? "",
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};
