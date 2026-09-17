import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { config } from "../../config";
import { User, IUser } from "../../models/User";
import { AppError } from "../../middlewares/errorHandler";

interface LoginDTO {
  email: string;
  password: string;
}

const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as StringValue });
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

  const token = generateToken(user._id.toString());

  return {
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
    token,
  };
};

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw createAppError("User not found", 404);
  }
  return { id: user._id, name: user.name, email: user.email, role: user.role };
};
