import { Request, Response, NextFunction } from "express";
import * as citaService from "./cita.service";

/**
 * POST /api/citas (service) — la llama el sub-flujo "JK - Agendar Cita".
 * Devuelve también `actualizada` para que el asesor virtual pueda decir si la
 * cita es nueva o si le movió la fecha a la que ya tenía.
 */
export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const resultado = await citaService.agendarCita(req.body);
    res.status(201).json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/citas?estado= (trabajador|admin)
 * La agenda del panel, por fecha.
 */
export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
    const citas = await citaService.listarCitas(estado);
    res.status(200).json({ success: true, data: citas });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/citas/:id (trabajador|admin)
 * Confirmar, mover o cancelar. Avisa al cliente cuando el cambio le importa.
 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cita = await citaService.actualizarCita(req.params.id, req.body);
    res.status(200).json({ success: true, data: cita });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/citas/:id/notificar (trabajador|admin)
 * Reenvía el último aviso cuando el primero no salió (p. ej. el cliente no había
 * escrito en las últimas 24 h y WhatsApp rechazó el texto).
 */
export const renotificar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cita = await citaService.renotificarCita(req.params.id);
    res.status(200).json({ success: true, data: cita });
  } catch (error) {
    next(error);
  }
};
