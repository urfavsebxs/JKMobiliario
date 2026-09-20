import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middlewares/accessControl";
import * as comprobanteService from "./comprobante.service";
import { MOTIVOS_RECHAZO } from "../../models/Comprobante";

/**
 * GET /api/comprobantes?estado=pendiente (trabajador|admin)
 * Lista para la pantalla de revisión del panel.
 */
export const list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
    const comprobantes = await comprobanteService.listarComprobantes(estado);
    res.status(200).json({ success: true, data: comprobantes });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/comprobantes/:id (trabajador|admin)
 * Detalle con los datos crudos que extrajo el análisis.
 */
export const detail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const comprobante = await comprobanteService.obtenerComprobante(req.params.id);
    res.status(200).json({ success: true, data: comprobante });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/comprobantes/imagen (service key — lo llama n8n)
 * Recibe el binario crudo y devuelve la `key` con la que después se registran
 * los metadatos. Va en dos llamadas porque n8n no puede mandar binario y JSON
 * en el mismo request.
 */
export const uploadImagen = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const telefono = typeof req.query.telefono === "string" ? req.query.telefono : "";

    const resultado = await comprobanteService.guardarImagen(buffer, telefono);
    res.status(201).json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/comprobantes (service key — lo llama n8n)
 * Registra el comprobante con lo que extrajo el modelo de visión.
 */
export const create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const comprobante = await comprobanteService.crearComprobante(req.body);
    res.status(201).json({ success: true, data: comprobante });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/comprobantes/:id/imagen (trabajador|admin)
 * Sirve la imagen desde el bucket privado. Nunca se expone por URL pública:
 * un comprobante lleva monto, fecha, banco y nombre del cliente.
 */
export const imagen = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { stream, mime, size } = await comprobanteService.abrirImagen(req.params.id);

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", size);
    // `private`: es una respuesta autenticada, ningún proxy debe cachearla.
    // `no-store` además evita que quede en el disco del navegador del trabajador.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "inline");

    stream.on("error", (error) => {
      // Si el stream falla a mitad del envío ya no hay cabeceras que cambiar;
      // se corta la conexión y se registra.
      console.error("[comprobantes] Error sirviendo la imagen:", error.message);
      res.destroy();
    });

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/comprobantes/:id (trabajador|admin)
 * Aprueba o rechaza. Al guardar, avisa a n8n para que el flujo de WhatsApp le
 * mande la plantilla al cliente.
 */
export const revisar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const usuarioId = req.user?._id?.toString() ?? "";
    const { comprobante, mensajeCliente } = await comprobanteService.revisarComprobante(
      req.params.id,
      req.body,
      usuarioId
    );

    // Best-effort: si n8n no responde, la revisión ya quedó guardada. El panel
    // se entera por `notificadoCliente` y puede reintentar.
    // Se manda el texto ya redactado para el cliente, no la clave interna del
    // motivo: el flujo de WhatsApp solo tiene que rellenar la plantilla.
    const notificado = await comprobanteService.notificarRevision({
      comprobanteId: comprobante._id.toString(),
      telefono: comprobante.telefono,
      phoneNumberId: comprobante.phoneNumberId,
      nombreCliente: comprobanteService.nombreParaSaludo(comprobante),
      estado: comprobante.estado as "aprobado" | "rechazado",
      mensajeCliente,
    });

    await comprobanteService.marcarNotificado(comprobante._id.toString(), notificado);

    res.status(200).json({
      success: true,
      data: { ...comprobante.toObject(), notificadoCliente: notificado },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/comprobantes/motivos-rechazo (trabajador|admin)
 * La lista cerrada de motivos, para que el panel no la duplique.
 */
export const motivos = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const lista = MOTIVOS_RECHAZO.map(({ clave, etiqueta }) => ({ clave, etiqueta }));
    res.status(200).json({ success: true, data: lista });
  } catch (error) {
    next(error);
  }
};
