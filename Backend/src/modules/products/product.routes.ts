import { Router } from "express";
import * as productController from "./product.controller";
import { upload } from "../../middlewares/upload";

const router = Router();

router.get("/", productController.getAll);
router.get("/:id", productController.getById);

router.post("/", upload.array("images", 10), productController.create);
router.put("/:id", upload.array("images", 10), productController.update);
router.delete("/:id", productController.remove);
router.patch("/:id/stock", productController.updateStock);
router.delete("/:id/image", productController.removeImage);

export default router;
