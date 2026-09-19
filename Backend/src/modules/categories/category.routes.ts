import { Router } from "express";
import * as categoryController from "./category.controller";
import { validateBody, validateParam } from "../../middlewares/validate";
import { createCategorySchema, objectIdParamSchema } from "../../middlewares/schemas";

const router = Router();

// ─── Public routes (ver config/routes.ts) ────────────────────────────
router.get("/", categoryController.list);

// ─── Admin routes (ver config/routes.ts) ─────────────────────────────
router.post("/", validateBody(createCategorySchema), categoryController.create);
router.delete("/:id", validateParam("id", objectIdParamSchema), categoryController.remove);

export default router;
