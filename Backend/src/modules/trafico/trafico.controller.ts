import { Request, Response, NextFunction } from "express";
import * as traficoService from "./trafico.service";
import { Periodo } from "../../models/Visita";

/**
 * POST /api/trafico/visita (pública)
 *
 * La llama el navegador del visitante con `sendBeacon`, sin sesión. Responde
 * 204 y sin cuerpo: el beacon no lee la respuesta, y contestar algo solo gasta
 * datos del visitante.
 *
 * Nunca revienta la visita por un dato raro: `registrarVisita` solo rechaza una
 * ruta que no sea del sitio, y ese 400 no lo ve nadie.
 */
export const registrar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await traficoService.registrarVisita({
      ruta: req.query.ruta as string,
      referidor: req.query.referidor as string | undefined,
      // Del lado del servidor: son datos que el visitante no puede falsear de
      // forma útil, y son la base del hash del visitante (que no guarda la IP).
      userAgent: req.get("user-agent") ?? "",
      ip: req.ip ?? "",
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/trafico/resumen?periodo=diario|semanal|mensual (solo admin)
 *
 * El reporte que pinta el panel. Se calcula en el momento (no se guardan
 * totales precalculados): con el volumen de la tienda, cinco agregaciones sobre
 * el índice `{ fecha, hora }` son más baratas que mantener contadores que se
 * pueden desincronizar.
 */
export const resumen = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const datos = await traficoService.resumenTrafico(req.query.periodo as Periodo);
    res.status(200).json({ success: true, data: datos });
  } catch (error) {
    next(error);
  }
};
