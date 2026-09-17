import { Router } from "express";
import * as productController from "./product.controller";
import { upload } from "../../middlewares/upload";
import { validateBody, validateParam, validateQuery } from "../../middlewares/validate";
import {
  createProductSchema,
  updateProductSchema,
  updateStockSchema,
  objectIdParamSchema,
  removeImageQuerySchema,
} from "../../middlewares/schemas";

const router = Router();

// ─── Public routes ───────────────────────────────────────────────────
router.get("/", productController.getAll);
router.get(
  "/:id",
  validateParam("id", objectIdParamSchema),
  productController.getById
);

// ─── Admin routes ────────────────────────────────────────────────────
router.post(
  "/",
  upload.array("images", 10),
  validateBody(createProductSchema),
  productController.create
);
router.put(
  "/:id",
  validateParam("id", objectIdParamSchema),
  upload.array("images", 10),
  validateBody(updateProductSchema),
  productController.update
);
router.post(
  "/:id/images",
  validateParam("id", objectIdParamSchema),
  upload.single("image"),
  productController.addImage
);
router.delete(
  "/:id",
  validateParam("id", objectIdParamSchema),
  productController.remove
);
router.patch(
  "/:id/stock",
  validateParam("id", objectIdParamSchema),
  validateBody(updateStockSchema),
  productController.updateStock
);

/**
 * DELETE /:id/image?imageUrl=...
 * imageUrl is passed as a query parameter to avoid body-in-DELETE issues
 * with proxies and intermediaries.
 */
router.delete(
  "/:id/image",
  validateParam("id", objectIdParamSchema),
  validateQuery(removeImageQuerySchema),
  productController.removeImage
);

export default router;
