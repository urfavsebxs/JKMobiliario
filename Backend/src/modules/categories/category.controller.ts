import { Request, Response, NextFunction } from "express";
import * as categoryService from "./category.service";

/**
 * GET /api/categories
 * Lista pública de categorías ordenadas por `order` y nombre.
 */
export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await categoryService.listCategories();
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/categories (admin)
 * Crea una categoría; 409 si el nombre normalizado ya existe.
 */
export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/categories/:id (admin)
 * Actualiza nombre/grupo/imagen; si cambia el nombre, sincroniza los
 * productos en cascada. Responde 200 { categoria, productosActualizados }.
 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await categoryService.updateCategory(req.params.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/categories/:id (admin)
 * Elimina la categoría; 404 si no existe y 409 si hay productos usándola.
 */
export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await categoryService.deleteCategory(req.params.id);
    res.status(200).json({ success: true, message: "Category deleted" });
  } catch (error) {
    next(error);
  }
};
