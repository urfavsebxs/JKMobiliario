import { Response, NextFunction } from "express";
import * as authService from "./auth.service";
import { AuthRequest } from "../../middlewares/accessControl";

export const login = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }
    const result = await authService.getProfile(req.user._id.toString());
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
