import { Router } from "express";
import * as productController from "./product.controller";
import { upload, uploadModel } from "../../middlewares/upload";
import { validateBody, validateParam, validateQuery } from "../../middlewares/validate";
import {
  createProductSchema,
  updateProductSchema,
  updateStockSchema,
  updateDiscountSchema,
  updateMedidasSchema,
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
 * PATCH /:id/discount
 * Actualiza el descuento activo del producto (0-100).
 * - Admin (ver config/routes.ts)
 * - Respuesta: 200 { success: true, data: <product> }
 */
router.patch(
  "/:id/discount",
  validateParam("id", objectIdParamSchema),
  validateBody(updateDiscountSchema),
  productController.updateDiscount
);

/**
 * PATCH /:id/medidas
 * Actualiza las medidas base (cm) del modelo GLB del producto.
 * Recibe JSON (express.json()): { medidasBase: { ancho?, largo?, alto? } }.
 * El string JSON aceptado por el schema solo aplica a POST/PUT (multer).
 * - Admin (ver config/routes.ts)
 * - Respuesta: 200 { success: true, data: <product> }
 */
router.patch(
  "/:id/medidas",
  validateParam("id", objectIdParamSchema),
  validateBody(updateMedidasSchema),
  productController.updateMedidas
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

/**
 * POST /:id/model
 * Sube (o reemplaza) el modelo 3D del producto.
 * - multipart/form-data con el campo "model"
 * - Solo .glb (model/gltf-binary), máximo 25MB
 * - Admin (ver config/routes.ts)
 * - Respuesta: 200 { success: true, data: <product> } con `model3d` actualizado
 */
router.post(
  "/:id/model",
  validateParam("id", objectIdParamSchema),
  uploadModel.single("model"),
  productController.uploadModel
);

/**
 * DELETE /:id/model
 * Elimina el modelo 3D del producto y su objeto en MinIO (idempotente).
 * - Admin (ver config/routes.ts)
 * - Respuesta: 200 { success: true, data: <product> } sin `model3d`
 */
router.delete(
  "/:id/model",
  validateParam("id", objectIdParamSchema),
  productController.removeModel
);

export default router;
