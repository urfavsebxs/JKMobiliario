import { Router } from "express";
import * as zonaController from "./zona.controller";
import { validateBody, validateParam, validateQuery } from "../../middlewares/validate";
import {
  coberturaQuerySchema,
  crearZonaSchema,
  objectIdParamSchema,
  updateZonaSchema,
} from "../../middlewares/schemas";

const router = Router();

// `/consulta` y `/publicas` son literales y van antes de cualquier `/:id`: si
// fueran después, Express las tomaría por un id y respondería un 400 de
// ObjectId inválido.
router.get("/consulta", validateQuery(coberturaQuerySchema), zonaController.consultar);

// Pública: las reglas de entrega sin notas ni configuración. La lee el asesor
// del chat de la web, que corre en Vercel y no tiene la clave de servicio.
router.get("/publicas", zonaController.publicas);

// ─── Panel (ver config/routes.ts) ────────────────────────────────────
router.get("/", zonaController.listar);
router.post("/", validateBody(crearZonaSchema), zonaController.crear);
router.patch(
  "/:id",
  validateParam("id", objectIdParamSchema),
  validateBody(updateZonaSchema),
  zonaController.actualizar
);
router.delete("/:id", validateParam("id", objectIdParamSchema), zonaController.eliminar);

export default router;
