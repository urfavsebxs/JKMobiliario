import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Roles disponibles.
 * - `admin`: gestión completa del catálogo y del panel.
 * - `trabajador`: solo revisa comprobantes de pago (`/admin/comprobantes`).
 */
export const ROLES = ["admin", "trabajador"] as const;
export type Rol = (typeof ROLES)[number];

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: Rol;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    // Default "trabajador" = menor privilegio: un usuario creado sin declarar
    // rol explícitamente nunca sale administrador. `seed.ts` y el script
    // `user:create` pasan el rol siempre de forma explícita.
    role: { type: String, enum: ROLES, default: "trabajador" },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>("User", userSchema, "auth");
