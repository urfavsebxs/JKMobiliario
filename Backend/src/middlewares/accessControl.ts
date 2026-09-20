import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { User, IUser, Rol } from "../models/User";
import { getAccess, AccessLevel } from "../config/routes";

export interface AuthRequest extends Request {
  user?: IUser;
}

/**
 * Comparación en tiempo constante. `timingSafeEqual` exige buffers del mismo
 * tamaño, así que se comparan los hashes (longitud fija) y no los valores
 * crudos, que además filtrarían la longitud de la clave.
 */
const clavesIguales = (a: string, b: string): boolean => {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

/**
 * Roles a los que cada nivel de acceso da entrada. Los niveles que no se
 * resuelven con un rol (`public`, `service`) no aparecen aquí.
 */
const ROLES_POR_NIVEL: Record<"trabajador" | "admin", Rol[]> = {
  // El admin ve todo, incluida la pantalla de comprobantes.
  trabajador: ["trabajador", "admin"],
  admin: ["admin"],
};

export const accessControl = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const access: AccessLevel = getAccess(req.method, req.path);

  if (access === "public") {
    next();
    return;
  }

  // Rutas de servicio (n8n): no llevan JWT, llevan una clave compartida.
  // Si la clave no está configurada, la ruta queda cerrada — nunca abierta.
  if (access === "service") {
    const clave = req.headers["x-jk-service-key"];
    if (!config.jkServiceKey || typeof clave !== "string" || !clavesIguales(clave, config.jkServiceKey)) {
      res.status(401).json({ message: "Invalid service key" });
      return;
    }
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

    if (access === "trabajador" || access === "admin") {
      if (!ROLES_POR_NIVEL[access].includes(user.role)) {
        res.status(403).json({ message: "Insufficient permissions" });
        return;
      }
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
