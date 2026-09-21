import { Router } from "express";
import * as clienteController from "./cliente.controller";
import { validateBody, validateParam, validateQuery } from "../../middlewares/validate";
import {
  fichaUpsertSchema,
  fichaQuerySchema,
  updateClienteSchema,
  objectIdParamSchema,
} from "../../middlewares/schemas";

const router = Router();

// ─── Service routes: las llama n8n con x-jk-service-key (ver config/routes.ts) ───
// `/ficha` es literal y va ANTES de `/:id`: si fuera después, Express la
// capturaría como un id y devolvería un 400 de ObjectId inválido.
router.get("/ficha", validateQuery(fichaQuerySchema), clienteController.obtenerFicha);
router.post("/ficha", validateBody(fichaUpsertSchema), clienteController.guardarFicha);

// ─── Panel (ver config/routes.ts) ────────────────────────────────────
router.get("/", clienteController.list);
router.get("/:id", validateParam("id", objectIdParamSchema), clienteController.get);
router.patch(
  "/:id",
  validateParam("id", objectIdParamSchema),
  validateBody(updateClienteSchema),
  clienteController.update
);

export default router;
