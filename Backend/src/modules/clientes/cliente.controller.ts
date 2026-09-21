import { Request, Response, NextFunction } from "express";
import * as clienteService from "./cliente.service";
import { CanalCliente } from "../../models/Cliente";

/**
 * GET /api/clientes (trabajador)
 * Lista de fichas para el panel, la actividad más reciente primero.
 */
export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientes = await clienteService.listarClientes();
    res.status(200).json({ success: true, data: clientes });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clientes/ficha?canal=&identificador= (service)
 * La lectura que hace n8n antes de responder. `data: null` si el cliente no
 * tiene ficha todavía; ver el comentario del servicio.
 */
export const obtenerFicha = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { canal, identificador } = req.query as { canal: CanalCliente; identificador: string };
    const ficha = await clienteService.obtenerFicha(canal, identificador);
    res.status(200).json({ success: true, data: ficha });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/clientes/ficha (service)
 * El upsert del paso automático de n8n, después de responder al cliente.
 */
export const guardarFicha = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ficha = await clienteService.guardarFicha(req.body);
    res.status(200).json({ success: true, data: ficha });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clientes/:id (trabajador)
 */
export const get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cliente = await clienteService.obtenerCliente(req.params.id);
    res.status(200).json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/clientes/:id (admin)
 * La corrección del dueño: aquí sí se puede escribir `notas`.
 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cliente = await clienteService.actualizarCliente(req.params.id, req.body);
    res.status(200).json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
};
