import { Request, Response, NextFunction } from "express";
import * as productService from "./product.service";

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.createProduct(req.body, req.files as Express.Multer.File[]);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const result = await productService.getProducts(page, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body, req.files as Express.Multer.File[]);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await productService.deleteProduct(req.params.id);
    res.status(200).json({ success: true, message: "Product deleted" });
  } catch (error) {
    next(error);
  }
};

export const updateStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { quantity } = req.body;
    const product = await productService.updateStock(req.params.id, quantity);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

export const addImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No image provided" });
      return;
    }
    const product = await productService.addImage(req.params.id, req.file);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove image from product.
 * imageUrl is now passed as a query parameter (e.g., DELETE /:id/image?imageUrl=...).
 */
export const removeImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const imageUrl = req.query.imageUrl as string;
    const product = await productService.removeImage(req.params.id, imageUrl);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload (or replace) a product's 3D model (.glb, multipart field "model").
 * Responds 200 { success: true, data: <product> } with `model3d` updated.
 */
export const uploadModel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No model provided" });
      return;
    }
    const product = await productService.uploadModel(req.params.id, req.file);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a product's 3D model and its MinIO object.
 * Responds 200 { success: true, data: <product> }.
 */
export const removeModel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.deleteModel(req.params.id);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a product's active discount percentage.
 * Responds 200 { success: true, data: <product> }.
 */
export const updateDiscount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { discountPercent } = req.body;
    const product = await productService.setDiscount(req.params.id, discountPercent);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a product's base measurements (cm) for its GLB model.
 * Responds 200 { success: true, data: <product> }.
 */
export const updateMedidas = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { medidasBase } = req.body;
    const product = await productService.setMedidasBase(req.params.id, medidasBase);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};
