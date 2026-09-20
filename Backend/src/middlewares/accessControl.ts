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

  // Ninguna respuesta de este middleware se puede cachear: todas dependen de
  // quién pide (el token de la cabecera). Un proxy intermedio que guardara un
  // 401 o un 403 lo serviría después a otro usuario. Aquí se cubren de una vez
  // los cinco `return` de abajo.
  res.set("Cache-Control", "no-store");

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
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; tv?: number };
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    // Cuenta dada de baja: se corta antes de mirar el rol, para que una
    // desactivación surta efecto en la siguiente petición y no haya que
    // esperar a que caduque el token.
    if (user.activo === false) {
      res.status(401).json({ message: "Account disabled" });
      return;
    }

    // Token de una versión anterior: la contraseña cambió (o un admin la
    // regeneró) después de que se emitiera, así que ya no vale. Esto es lo que
    // hace real el "vuelve a iniciar sesión".
    //
    // La comparación es por número entero, no por fecha: `iat` viene truncado
    // a segundos, así que comparar fechas dejaría vivo un token emitido en el
    // mismo segundo del cambio. Un contador no tiene esa zona gris.
    //
    // Un `tv` ausente se lee como 0 para no echar a nadie al desplegar: los
    // tokens emitidos antes de que existiera este campo siguen valiendo hasta
    // que su dueño cambie la contraseña.
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      res.status(401).json({ message: "Session expired" });
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
