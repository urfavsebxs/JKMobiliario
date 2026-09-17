import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "./auth.controller";
import { validateBody } from "../../middlewares/validate";
import { loginSchema } from "../../middlewares/schemas";

const router = Router();

// Rate limiter for login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts, please try again later" },
});

router.post("/login", loginLimiter, validateBody(loginSchema), authController.login);
router.get("/profile", authController.getProfile);

export default router;
