import { Router } from "express";
import * as userController from "./user.controller";
import { validateBody, validateParam } from "../../middlewares/validate";
import { createUserSchema, updateActivoSchema, objectIdParamSchema } from "../../middlewares/schemas";

const router = Router();

// ─── Admin routes (ver config/routes.ts) ─────────────────────────────
// Todo el módulo es solo para admin: el nivel de acceso lo declara
// config/routes.ts, no este archivo (una sola fuente de verdad).
router.get("/", userController.list);
router.post("/", validateBody(createUserSchema), userController.create);
router.patch(
  "/:id/activo",
  validateParam("id", objectIdParamSchema),
  validateBody(updateActivoSchema),
  userController.activo
);
router.post(
  "/:id/password-temporal",
  validateParam("id", objectIdParamSchema),
  userController.passwordTemporal
);

export default router;
