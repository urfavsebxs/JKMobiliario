import { Router } from "express";
import * as authController from "./auth.controller";

const router = Router();

router.post("/login", authController.login);
router.get("/profile", authController.getProfile);

export default router;
