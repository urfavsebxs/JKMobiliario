import mongoose, { Document, Schema, Types } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Roles disponibles.
 * - `admin`: gestión completa del catálogo y del panel.
 * - `trabajador`: solo revisa comprobantes de pago (`/admin/comprobantes`).
 */
export const ROLES = ["admin", "trabajador"] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Cuánto vale una contraseña temporal desde que se genera.
 *
 * La contraseña la entrega un administrador a mano (no hay correo en el
 * sistema), así que circula por un canal que no controlamos. Si el trabajador
 * nunca llega a entrar, esta ventana evita que esa credencial quede válida
 * para siempre: pasado el plazo, el login la rechaza y hay que regenerarla.
 */
export const DIAS_PASSWORD_TEMPORAL = 7;

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: Rol;
  /**
   * `true` mientras la contraseña vigente sea la temporal que generó un
   * administrador. Obliga a cambiarla en el primer login.
   *
   * Default `false` a propósito: las cuentas que ya existían no tienen el
   * campo, y Mongoose lo rellena con el default al leerlas, así que siguen
   * funcionando sin migración.
   */
  debeCambiarPassword: boolean;
  /** Cuándo deja de servir la temporal. Solo aplica con el flag en `true`. */
  passwordTemporalExpira?: Date;
  /** `false` = cuenta dada de baja: no puede iniciar sesión. */
  activo: boolean;
  /** Quién dio de alta esta cuenta (auditoría mínima). */
  creadoPor?: Types.ObjectId;
  /**
   * Versión de los tokens válidos de esta cuenta. Se copia en el JWT al
   * iniciar sesión y se incrementa al cambiar (o regenerar) la contraseña; un
   * token con una versión anterior deja de valer — ver `accessControl.ts`.
   *
   * Sin esto, "vuelve a iniciar sesión" sería cosmético: el JWT no se puede
   * revocar y el token de la contraseña temporal seguiría sirviendo hasta su
   * expiración (24h por defecto).
   */
  tokenVersion: number;
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
    // rol explícitamente nunca sale administrador. `seed.ts` y el módulo de
    // usuarios pasan el rol siempre de forma explícita.
    role: { type: String, enum: ROLES, default: "trabajador" },
    debeCambiarPassword: { type: Boolean, default: false },
    passwordTemporalExpira: { type: Date },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    tokenVersion: { type: Number, default: 0 },
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
