import { Router } from "express";
import * as comprobanteController from "./comprobante.controller";
import { validateBody, validateParam } from "../../middlewares/validate";
import { rawComprobante } from "../../middlewares/upload";
import {
  comprobanteImagenSchema,
  createComprobanteSchema,
  revisarComprobanteSchema,
  objectIdParamSchema,
} from "../../middlewares/schemas";

const router = Router();

// ─── Rutas de servicio (las llama n8n; ver config/routes.ts) ─────────

/**
 * El binario va como cuerpo crudo (n8n manda `contentType: binaryData`), así
 * que `rawComprobante` sustituye a `express.json` SOLO en esta ruta. El
 * `telefono` viaja en el query string porque el cuerpo entero es la imagen.
 *
 * `express.json` corre antes, a nivel de app, y sobre un cuerpo binario no
 * hace nada: no es JSON, así que lo deja intacto para este parser.
 */
router.post(
  "/imagen",
  rawComprobante,
  (req, res, next) => {
    const result = comprobanteImagenSchema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({ success: false, message: "Validation error", errors });
      return;
    }
    next();
  },
  comprobanteController.uploadImagen
);

router.post("/", validateBody(createComprobanteSchema), comprobanteController.create);

// ─── Rutas del panel (trabajador|admin; ver config/routes.ts) ────────

router.get("/", comprobanteController.list);
// Antes de "/:id" para que "motivos-rechazo" no se lea como un id.
router.get("/motivos-rechazo", comprobanteController.motivos);
router.get("/:id", validateParam("id", objectIdParamSchema), comprobanteController.detail);
router.get(
  "/:id/imagen",
  validateParam("id", objectIdParamSchema),
  comprobanteController.imagen
);
router.patch(
  "/:id",
  validateParam("id", objectIdParamSchema),
  validateBody(revisarComprobanteSchema),
  comprobanteController.revisar
);

export default router;
