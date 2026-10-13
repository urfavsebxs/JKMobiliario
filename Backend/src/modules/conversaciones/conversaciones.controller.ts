import { Request, Response, NextFunction } from "express";
import * as conversacionesService from "./conversaciones.service";

/**
 * GET /api/conversaciones (solo admin)
 *
 * Lista las sesiones de WhatsApp guardadas en la memoria de n8n. Son
 * conversaciones reales de clientes: el acceso es de admin, no de cualquiera
 * con sesión abierta.
 */
export const listar = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const datos = await conversacionesService.listarConversaciones();
    res.status(200).json({ success: true, data: datos });
  } catch (error) {
    next(error);
  }
};

/** GET /api/conversaciones/:sessionId (solo admin) — la conversación completa. */
export const obtener = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const datos = await conversacionesService.obtenerConversacion(req.params.sessionId);
    res.status(200).json({ success: true, data: datos });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversaciones/:sessionId/imagenes/:archivo (solo admin)
 *
 * Sirve una imagen que mandó el cliente. Va autenticada y la clave se arma en el
 * servidor a partir del `sessionId`, así que el llamador no puede pedir el objeto
 * de otro cliente. La etiqueta `<img>` no puede mandar la cabecera Authorization,
 * por eso el panel la pide con `fetch` y la pinta desde un blob.
 */
export const imagen = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { stream, mime, size } = await conversacionesService.abrirImagen(
      req.params.sessionId,
      req.params.archivo
    );

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", size);
    // Es una respuesta autenticada con datos de un cliente: ni los proxies ni el
    // disco del navegador deben guardarla.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "inline");

    stream.on("error", (error) => {
      console.error("[conversaciones] Error sirviendo la imagen:", error.message);
      res.destroy();
    });

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};
