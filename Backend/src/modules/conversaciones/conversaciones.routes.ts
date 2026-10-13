import { Router } from "express";
import * as conversacionesController from "./conversaciones.controller";
import { validateParam } from "../../middlewares/validate";
import { sessionIdParamSchema, archivoImagenParamSchema } from "../../middlewares/schemas";

const router = Router();

// Solo lectura: la conversación la escribe n8n, no el panel. Desde aquí se
// consulta, nunca se toca.
router.get("/", conversacionesController.listar);
router.get("/:sessionId", validateParam("sessionId", sessionIdParamSchema), conversacionesController.obtener);
// Las imágenes que mandó el cliente. Van antes que ninguna ruta de un solo
// segmento: si el orden se invirtiera, `:sessionId` capturaría "imagenes".
router.get(
  "/:sessionId/imagenes/:archivo",
  validateParam("sessionId", sessionIdParamSchema),
  validateParam("archivo", archivoImagenParamSchema),
  conversacionesController.imagen
);

export default router;
