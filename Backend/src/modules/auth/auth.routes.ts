import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "./auth.controller";
import { validateBody } from "../../middlewares/validate";
import { loginSchema, changePasswordSchema } from "../../middlewares/schemas";

const router = Router();

// Rate limiter for login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts, please try again later" },
});

// El cambio de contraseña valida la actual, así que es un oráculo de
// verificación: sin límite, un token robado podría probar contraseñas sin
// freno. Se limita más estrecho que el login porque un usuario legítimo lo usa
// una vez, no en ráfaga.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos, inténtalo más tarde" },
});

router.post("/login", loginLimiter, validateBody(loginSchema), authController.login);
router.get("/profile", authController.getProfile);
router.post(
  "/change-password",
  changePasswordLimiter,
  validateBody(changePasswordSchema),
  authController.changePassword
);

export default router;
