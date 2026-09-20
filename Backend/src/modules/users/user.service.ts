import { User, IUser, ROLES, Rol, DIAS_PASSWORD_TEMPORAL } from "../../models/User";
import { AppError } from "../../middlewares/errorHandler";
import { generarClaveTemporal } from "../../lib/passwords";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/** Cuenta tal como la consume la isla de usuarios del panel. */
export interface UsuarioPanel {
  _id: string;
  name: string;
  email: string;
  role: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  creadoPor?: string;
  createdAt: Date;
}

/**
 * Campos que se devuelven al panel. Deliberadamente NO incluye `password` ni
 * `passwordTemporalExpira`: el hash nunca sale de la base.
 */
const CAMPOS_PANEL = "name email role activo debeCambiarPassword creadoPor createdAt";

/**
 * Recorta un documento a los campos del panel.
 *
 * No es cosmético: `User.create()` devuelve el documento con TODOS los campos en
 * memoria, incluido el hash que el hook `pre("save")` acaba de escribir. El
 * `select: false` del modelo solo recorta las consultas, no ese caso, así que sin
 * esto el hash viajaría al navegador dentro de la respuesta del POST. Y
 * `creadoPor` sale como string para que el tipo no mienta al serializarse.
 */
const aPanel = (usuario: IUser): UsuarioPanel => ({
  _id: usuario._id.toString(),
  name: usuario.name,
  email: usuario.email,
  role: usuario.role,
  activo: usuario.activo,
  debeCambiarPassword: usuario.debeCambiarPassword,
  creadoPor: usuario.creadoPor?.toString(),
  createdAt: usuario.createdAt,
});


/** Error 11000 de Mongo: choque contra un índice único. */
const esClaveDuplicada = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

interface CrearUsuarioDTO {
  name: string;
  email: string;
  role: Rol;
}

/**
 * Crea una cuenta con una contraseña temporal aleatoria.
 *
 * Devuelve la contraseña EN CLARO una sola vez, para que el administrador se la
 * entregue al trabajador. No se guarda en ningún sitio (solo su hash) y no hay
 * forma de volver a consultarla: si se pierde, se regenera con
 * `regenerarPasswordTemporal`.
 */
export const crearUsuario = async (
  data: CrearUsuarioDTO,
  adminId: string
): Promise<{ usuario: UsuarioPanel; passwordTemporal: string }> => {
  if (!ROLES.includes(data.role)) {
    throw createAppError("Rol no válido", 400);
  }

  const existente = await User.findOne({ email: data.email });
  if (existente) {
    throw createAppError("Ya existe una cuenta con ese correo", 409);
  }

  const passwordTemporal = generarClaveTemporal();
  const expira = new Date(Date.now() + DIAS_PASSWORD_TEMPORAL * 24 * 60 * 60 * 1000);

  // `creadoPor` y `passwordTemporalExpira` los fija el servidor, nunca el
  // cliente: si vinieran del body, un admin podría crear una cuenta sin
  // caducidad o atribuir el alta a otro.
  try {
    const usuario = await User.create({
      name: data.name,
      email: data.email,
      password: passwordTemporal,
      role: data.role,
      debeCambiarPassword: true,
      passwordTemporalExpira: expira,
      activo: true,
      creadoPor: adminId,
    });

    return { usuario: aPanel(usuario), passwordTemporal };
  } catch (error) {
    // Dos admins creando el mismo correo a la vez: el `findOne` de arriba pasó
    // en los dos, pero el índice único de `email` solo admite uno. Sin esto,
    // el perdedor vería un 500 genérico en vez de un mensaje entendible.
    if (esClaveDuplicada(error)) {
      throw createAppError("Ya existe una cuenta con ese correo", 409);
    }
    throw error;
  }
};

/** Lista de cuentas para el panel, sin hashes ni fechas de caducidad. */
export const listarUsuarios = async (): Promise<UsuarioPanel[]> => {
  const usuarios = await User.find().select(CAMPOS_PANEL).sort({ createdAt: 1 });
  return usuarios.map(aPanel);
};

/**
 * Genera una contraseña temporal nueva para una cuenta que perdió la suya o
 * cuya temporal caducó. Vuelve a exigir el cambio en el próximo login, y corta
 * la sesión que estuviera abierta.
 */
export const regenerarPasswordTemporal = async (
  id: string
): Promise<{ usuario: UsuarioPanel; passwordTemporal: string }> => {
  const usuario = await User.findById(id);
  if (!usuario) {
    throw createAppError("Usuario no encontrado", 404);
  }

  const passwordTemporal = generarClaveTemporal();
  usuario.password = passwordTemporal;
  usuario.debeCambiarPassword = true;
  usuario.passwordTemporalExpira = new Date(
    Date.now() + DIAS_PASSWORD_TEMPORAL * 24 * 60 * 60 * 1000
  );
  // Si el trabajador tenía la sesión abierta, esta regeneración la cierra: si
  // no, quien estuviera dentro seguiría dentro con la contraseña vieja, que es
  // justo lo que se quiere evitar cuando se regenera una credencial.
  usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1;

  // `save()` y no `updateOne`: el hash lo hace el hook `pre("save")`, y un
  // `updateOne` guardaría la contraseña en texto plano.
  await usuario.save();

  return { usuario: aPanel(usuario), passwordTemporal };
};

interface CambiarActivoDTO {
  activo: boolean;
}

/**
 * Da de baja o reactiva una cuenta.
 *
 * No se borra ningún usuario nunca: `Comprobante.revisadoPor` apunta a él, y
 * borrarlo dejaría las revisiones sin autor. Desactivar corta el acceso en la
 * siguiente petición (ver `accessControl`).
 */
export const cambiarActivo = async (
  id: string,
  data: CambiarActivoDTO,
  solicitanteId: string
): Promise<UsuarioPanel> => {
  const usuario = await User.findById(id);
  if (!usuario) {
    throw createAppError("Usuario no encontrado", 404);
  }

  // Desactivarse a sí mismo deja a quien lo hace fuera del panel al instante.
  if (id === solicitanteId && !data.activo) {
    throw createAppError("No puedes desactivar tu propia cuenta", 400);
  }

  // Quedarse sin ningún admin activo no tiene vuelta atrás desde el panel: ya
  // no hay script de CLI con el que recuperarlo.
  //
  // En la práctica esta guarda casi no llega a dispararse, y conviene saberlo:
  // para llamar aquí hay que ser un admin ACTIVO, así que si solo queda uno, el
  // que llama es él mismo y lo atrapa antes la comprobación de arriba (400). Se
  // deja igual porque protege un caso que las condiciones de carrera sí pueden
  // producir (dos admins desactivándose a la vez, cada uno viendo al otro vivo)
  // y porque no cuesta nada. NO es, en cambio, la red que impide dejar el
  // sistema sin administración: de eso se encarga la guarda de "tu propia
  // cuenta". Que esté aquí no la vuelve prescindible.
  if (!data.activo && usuario.role === "admin") {
    const adminsActivos = await User.countDocuments({ role: "admin", activo: true });
    if (adminsActivos <= 1) {
      throw createAppError("No puedes desactivar al último administrador activo", 409);
    }
  }

  usuario.activo = data.activo;
  await usuario.save();

  return aPanel(usuario);
};
