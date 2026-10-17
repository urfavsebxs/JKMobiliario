import { Router } from "express";
import * as mensajeController from "./mensaje.controller";
import { validateBody, validateQuery } from "../../middlewares/validate";
import { citadoQuerySchema, registrarMensajeSchema } from "../../middlewares/schemas";

const router = Router();

// Las dos son de servicio: las llama n8n con `x-jk-service-key` (ver
// config/routes.ts). No hay rutas de panel aquí; el panel no necesita saber qué
// mensajes envió el asesor.
router.post("/enviado", validateBody(registrarMensajeSchema), mensajeController.registrar);
router.get("/enviado", validateQuery(citadoQuerySchema), mensajeController.citado);

export default router;
