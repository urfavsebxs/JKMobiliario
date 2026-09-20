/**
 * createUser — Crea (o actualiza la contraseña de) una cuenta del panel.
 *
 * Uso:
 *   pnpm user:create -- --email trabajador@jkmobiliario.digital --name "Ana" --role trabajador
 *   pnpm user:create -- --email admin@jkmobiliario.digital --name "Sebastián" --role admin --password "unaClaveLarga"
 *
 * Flags:
 *   --email <correo>    Obligatorio.
 *   --name <nombre>     Obligatorio. Nombre visible en el panel.
 *   --role <rol>        `admin` o `trabajador`. Por defecto `trabajador` (menor
 *                       privilegio: nunca sale admin por omisión).
 *   --password <clave>  Opcional. Si no se pasa, se genera una aleatoria y se
 *                       imprime UNA vez al final. Mínimo 12 caracteres.
 *   --reset             Si el correo ya existe, actualiza nombre/rol y, si se
 *                       pasó --password, también la contraseña.
 *
 * Seguridad operativa:
 *   - No existe ninguna llamada DELETE en este script.
 *   - Sin --reset, un correo ya existente es un error (no se sobrescribe nada).
 *   - El hash lo hace el hook `pre("save")` del modelo User; aquí nunca se
 *     escribe una contraseña en claro en la base.
 *   - Nunca imprime la contraseña salvo la generada, y solo en el momento de
 *     crearla.
 */

import crypto from "node:crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { config } from "../config";
import { User, ROLES, Rol } from "../models/User";

dotenv.config();

/** Longitud de la contraseña generada automáticamente. */
const LARGO_CLAVE_GENERADA = 16;

const USO = `
Uso:
  pnpm user:create -- --email <correo> --name <nombre> [--role admin|trabajador]
                      [--password <clave>] [--reset]

Ejemplos:
  pnpm user:create -- --email trabajador@jkmobiliario.digital --name "Ana" --role trabajador
  pnpm user:create -- --email admin@jkmobiliario.digital --name "Sebastián" --role admin --reset
`.trim();

interface Args {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
  reset: boolean;
  help: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const args: Args = { reset: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const actual = argv[i];
    switch (actual) {
      case "--email":
        args.email = argv[++i];
        break;
      case "--name":
        args.name = argv[++i];
        break;
      case "--role":
        args.role = argv[++i];
        break;
      case "--password":
        args.password = argv[++i];
        break;
      case "--reset":
        args.reset = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        // Ignora el "--" que pnpm inserta antes de los flags propios.
        if (actual !== "--") {
          console.error(`Flag desconocido: ${actual}`);
          args.help = true;
        }
    }
  }

  return args;
};

/**
 * Contraseña aleatoria legible (sin caracteres ambiguos como O/0 o l/1), para
 * poder dictarla por teléfono si hace falta.
 */
const generarClave = (): string => {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(LARGO_CLAVE_GENERADA);
  return Array.from(bytes, (byte) => alfabeto[byte % alfabeto.length]).join("");
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.email || !args.name) {
    console.log(USO);
    process.exit(args.help ? 0 : 1);
  }

  const role = (args.role ?? "trabajador") as Rol;
  if (!ROLES.includes(role)) {
    console.error(`Rol no válido: "${args.role}". Opciones: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  if (args.password !== undefined && args.password.length < 12) {
    console.error("La contraseña debe tener al menos 12 caracteres.");
    process.exit(1);
  }

  const email = args.email.toLowerCase().trim();

  await mongoose.connect(config.mongoUri);

  try {
    const existente = await User.findOne({ email });

    if (existente && !args.reset) {
      console.error(
        `Ya existe una cuenta con ${email} (rol: ${existente.role}).\n` +
          `Usa --reset para actualizar su nombre/rol${args.password ? " y contraseña" : ""}.`
      );
      process.exit(1);
    }

    if (existente) {
      existente.name = args.name;
      existente.role = role;
      // Solo se toca la contraseña si se pidió explícitamente; el hook
      // `pre("save")` la rehashea solo cuando cambia.
      if (args.password) existente.password = args.password;
      await existente.save();

      console.log(`Cuenta actualizada: ${email} (rol: ${role})`);
      if (args.password) console.log("Contraseña reemplazada por la indicada.");
      return;
    }

    const password = args.password ?? generarClave();
    await User.create({ name: args.name, email, password, role });

    console.log(`Cuenta creada: ${email} (rol: ${role})`);
    if (!args.password) {
      // Única vez que se imprime: no queda guardada en claro en ningún lado.
      console.log(`Contraseña generada (cópiala ahora, no se vuelve a mostrar): ${password}`);
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Error creando la cuenta:", error);
  process.exit(1);
});
