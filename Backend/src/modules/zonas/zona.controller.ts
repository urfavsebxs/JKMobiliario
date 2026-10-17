import { Request, Response, NextFunction } from "express";
import * as zonaService from "./zona.service";
import { IZonaEntrega } from "../../models/ZonaEntrega";

/**
 * Forma de una zona en la respuesta del panel.
 *
 * `_id` sale como `id` porque es lo que usa el resto del panel, y se listan los
 * campos uno por uno para que un campo nuevo del modelo no se cuele solo en la
 * respuesta sin que nadie lo revise.
 */
const formatearZona = (zona: IZonaEntrega) => ({
  id: zona.id as string,
  departamento: zona.departamento,
  municipio: zona.municipio ?? "",
  barrio: zona.barrio ?? "",
  activo: zona.activo,
  nota: zona.nota ?? "",
});

/**
 * GET /api/zonas (solo admin) — todas las reglas de entrega, para la pantalla
 * del panel. Incluye la `nota` interna, que nunca sale hacia el cliente.
 */
export const listar = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const zonas = await zonaService.listarZonas();
    res.status(200).json({ success: true, data: zonas.map(formatearZona) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/zonas (solo admin) — agrega un municipio o un barrio a la
 * cobertura. Los 33 departamentos ya vienen sembrados, así que aquí lo normal
 * es dar de alta un barrio: "en Medellín no vamos a Belén".
 */
export const crear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const zona = await zonaService.crearZona(req.body);
    res.status(201).json({ success: true, data: formatearZona(zona) });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/zonas/consulta?ubicacion=... (servicio: la llama n8n)
 *
 * Responde si el mueble se entrega en el lugar que se deduce del texto. Siempre
 * 200, incluso cuando no reconoce la ubicación: un 404 obligaría al asesor a
 * distinguir "no llegamos" de "no te entendí", y esa diferencia es justo la que
 * no se puede perder.
 */
export const consultar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const datos = await zonaService.consultarCobertura(req.query.ubicacion as string);
    res.status(200).json({ success: true, data: datos });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/zonas/publicas (público) — las reglas de entrega sin la `nota` ni el
 * `_id`, para que el asesor de la web pueda confirmar la cobertura.
 *
 * Es la lista la que es pública, no la configuración interna: sale lo mismo que
 * la empresa diría por teléfono si le preguntan si llega a un barrio.
 */
export const publicas = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reglas = await zonaService.reglasPublicas();
    res.status(200).json({ success: true, data: { reglas } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/zonas/:id (solo admin) — activa o desactiva la entrega en un lugar
 * y guarda su nota interna.
 */
export const actualizar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const zona = await zonaService.actualizarZona(req.params.id as string, req.body);
    res.status(200).json({ success: true, data: formatearZona(zona) });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/zonas/:id (solo admin) — quita un municipio o un barrio agregado
 * a mano. Un departamento no se puede borrar (ver `eliminarZona`).
 */
export const eliminar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await zonaService.eliminarZona(req.params.id as string);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
