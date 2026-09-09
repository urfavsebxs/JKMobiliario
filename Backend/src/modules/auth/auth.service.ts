import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { config } from "../../config";
import { User, IUser } from "../../models/User";

interface LoginDTO {
  email: string;
  password: string;
}

const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as StringValue });
};

export const login = async (data: LoginDTO) => {
  const user = await User.findOne({ email: data.email }).select("+password");
  if (!user) {
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  const isMatch = await user.comparePassword(data.password);
  if (!isMatch) {
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
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
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }
  return { id: user._id, name: user.name, email: user.email, role: user.role };
};
