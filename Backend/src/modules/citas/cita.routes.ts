import { Router } from "express";
import * as citaController from "./cita.controller";
import { validateBody, validateParam } from "../../middlewares/validate";
import { createCitaSchema, updateCitaSchema, objectIdParamSchema } from "../../middlewares/schemas";

const router = Router();

// ─── Ruta de servicio (la llama n8n; ver config/routes.ts) ───────────
router.post("/", validateBody(createCitaSchema), citaController.create);

// ─── Rutas del panel (trabajador|admin; ver config/routes.ts) ────────
router.get("/", citaController.list);
router.patch(
  "/:id",
  validateParam("id", objectIdParamSchema),
  validateBody(updateCitaSchema),
  citaController.update
);
// Reintento del aviso: la cita no cambia, solo se vuelve a mandar el mensaje.
router.post(
  "/:id/notificar",
  validateParam("id", objectIdParamSchema),
  citaController.renotificar
);

export default router;
