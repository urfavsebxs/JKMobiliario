import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middlewares/accessControl";
import * as userService from "./user.service";

/**
 * GET /api/users (admin)
 * Lista las cuentas del panel.
 */
export const list = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const usuarios = await userService.listarUsuarios();
    res.status(200).json({ success: true, data: usuarios });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users (admin)
 * Crea una cuenta con contraseña temporal. La contraseña en claro va en la
 * respuesta y NO se vuelve a poder consultar: es la única vez que se ve.
 */
export const create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const adminId = req.user?._id?.toString() ?? "";
    const { usuario, passwordTemporal } = await userService.crearUsuario(req.body, adminId);
    res.status(201).json({ success: true, data: { usuario, passwordTemporal } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/:id/activo (admin)
 * Da de baja o reactiva una cuenta.
 */
export const activo = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const solicitanteId = req.user?._id?.toString() ?? "";
    const usuario = await userService.cambiarActivo(req.params.id, req.body, solicitanteId);
    res.status(200).json({ success: true, data: usuario });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/:id/password-temporal (admin)
 * Regenera la contraseña temporal de una cuenta que la perdió o la dejó
 * caducar. La devuelve una sola vez, igual que la creación.
 */
export const passwordTemporal = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { usuario, passwordTemporal } = await userService.regenerarPasswordTemporal(req.params.id);
    res.status(200).json({ success: true, data: { usuario, passwordTemporal } });
  } catch (error) {
    next(error);
  }
};
