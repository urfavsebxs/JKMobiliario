import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { config } from "../../config";
import { User, IUser } from "../../models/User";
import { AppError } from "../../middlewares/errorHandler";

interface LoginDTO {
  email: string;
  password: string;
}

const generateToken = (userId: string, tokenVersion: number): string => {
  // `tv` viaja en el token para poder invalidarlo: `accessControl` lo compara
  // con el de la base y rechaza los de una versión anterior.
  return jwt.sign({ id: userId, tv: tokenVersion }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as StringValue,
  });
};

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

export const login = async (data: LoginDTO) => {
  const user = await User.findOne({ email: data.email }).select("+password");
  if (!user) {
    throw createAppError("Invalid credentials", 401);
  }

  const isMatch = await user.comparePassword(data.password);
  if (!isMatch) {
    throw createAppError("Invalid credentials", 401);
  }

  // Las dos comprobaciones van DESPUÉS de verificar la contraseña, para no
  // revelar qué cuentas existen a quien no acierta la clave.
  if (user.activo === false) {
    throw createAppError("Esta cuenta está desactivada. Contacta al administrador.", 403);
  }

  if (user.debeCambiarPassword && user.passwordTemporalExpira && user.passwordTemporalExpira < new Date()) {
    throw createAppError(
      "Tu contraseña temporal caducó. Pide al administrador que genere una nueva.",
      403
    );
  }

  const token = generateToken(user._id.toString(), user.tokenVersion ?? 0);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      // El frontend lo lee para mandar al usuario a la pantalla de cambio en
      // lugar de a su panel.
      debeCambiarPassword: user.debeCambiarPassword,
    },
    token,
  };
};

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw createAppError("User not found", 404);
  }
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    // Sin este campo aquí, la pantalla de cambio no podría saber si ya se hizo
    // el cambio (el perfil es lo que consulta el middleware en cada navegación).
    debeCambiarPassword: user.debeCambiarPassword,
  };
};

interface CambiarPasswordDTO {
  passwordActual: string;
  passwordNueva: string;
}

/**
 * Cambia la contraseña del propio usuario y cierra su sesión anterior.
 *
 * Al subir `tokenVersion`, `accessControl` rechaza cualquier token emitido antes
 * de este momento. Eso es lo que hace real el "vuelve a iniciar sesión": sin
 * ello, el token de la contraseña temporal seguiría sirviendo hasta su
 * expiración (y, peor, volvería a funcionar con normalidad en cuanto el flag
 * `debeCambiarPassword` quedara en `false`).
 */
export const cambiarPassword = async (
  userId: string,
  data: CambiarPasswordDTO
): Promise<{ debeVolverAEntrar: true }> => {
  // `+password` es obligatorio: `comparePassword` necesita el hash y el campo
  // tiene `select: false`.
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw createAppError("User not found", 404);
  }

  const esLaActual = await user.comparePassword(data.passwordActual);
  if (!esLaActual) {
    throw createAppError("La contraseña actual no es correcta", 401);
  }

  // Evita que alguien "cambie" la temporal por la temporal: si la nueva es
  // igual a la vigente, el cambio no cambió nada.
  const esLaMisma = await user.comparePassword(data.passwordNueva);
  if (esLaMisma) {
    throw createAppError("La contraseña nueva debe ser distinta a la actual", 400);
  }

  user.password = data.passwordNueva;
  user.debeCambiarPassword = false;
  user.passwordTemporalExpira = undefined;
  // Sube la versión: todo token emitido antes de este momento deja de valer en
  // la siguiente petición. Es lo que convierte el "vuelve a iniciar sesión" en
  // algo real y no en una limpieza de localStorage.
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;

  // `save()` y no `updateOne`: el hook `pre("save")` es el que hashea.
  await user.save();

  return { debeVolverAEntrar: true };
};
