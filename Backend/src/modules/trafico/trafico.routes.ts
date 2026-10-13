import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as traficoController from "./trafico.controller";
import { validateQuery } from "../../middlewares/validate";
import { visitaSchema, resumenTraficoQuerySchema } from "../../middlewares/schemas";

const router = Router();

/**
 * Límite de la ruta pública. Un visitante que navega el catálogo manda una
 * visita por página; 300 en 15 minutos cubre de sobra a una persona curioseando
 * el catálogo entero, y corta a quien mande el beacon en bucle.
 *
 * `validate: { xForwardedForHeader: false }` no hace falta: `trust proxy` ya
 * está en 1 (ver index.ts).
 */
const visitaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Silencioso a propósito: es una ruta de navegación, no una de credenciales.
  // Un 429 aquí no se le muestra a nadie (el beacon ignora la respuesta).
  message: { success: false, message: "Demasiadas visitas seguidas" },
});

// La visita llega por query string (ver `visitaSchema`): el navegador la manda
// sin cuerpo para no disparar el preflight de CORS.
router.post("/visita", visitaLimiter, validateQuery(visitaSchema), traficoController.registrar);
router.get("/resumen", validateQuery(resumenTraficoQuerySchema), traficoController.resumen);

export default router;
