import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { User, IUser } from "../models/User";
import { getAccess } from "../config/routes";

export interface AuthRequest extends Request {
  user?: IUser;
}

export const accessControl = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const access = getAccess(req.method, req.path);

  if (access === "public") {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string };
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    if (access === "admin" && user.role !== "admin") {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
