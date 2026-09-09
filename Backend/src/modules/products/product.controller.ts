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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
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

export const removeImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { imageUrl } = req.body;
    const product = await productService.removeImage(req.params.id, imageUrl);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};
