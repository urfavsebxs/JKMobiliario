/**
 * Verificación automática del alta de usuarios y del cambio obligatorio de
 * contraseña.
 *
 * Comprueba las invariantes que no se ven a simple vista y que un repaso manual
 * solo verifica una vez: que el gate de la contraseña temporal no se pueda
 * saltar (ni siquiera siendo admin), que el token anterior deje de valer de
 * verdad, que el hash nunca salga en una respuesta y que las guardas de bajas
 * aguanten.
 *
 * Uso:
 *   pnpm verificar:usuarios
 */
import mongoose from "mongoose";
import { User } from "../models/User";
import app from "../index";
import { connectDB } from "../config/database";

const PUERTO = 4100;
const BASE = `http://127.0.0.1:${PUERTO}`;
const CLAVE_ADMIN = "ClaveAdminLarga2026!";

let pasadas = 0;
let falladas = 0;

const ok = (nombre: string, detalle = "") => {
  pasadas++;
  console.log(`  PASA  ${nombre}${detalle ? ` — ${detalle}` : ""}`);
};
const fallo = (nombre: string, detalle = "") => {
  falladas++;
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ""}`);
};

const comprobar = (nombre: string, condicion: boolean, detalle = "") => {
  if (condicion) ok(nombre, detalle);
  else fallo(nombre, detalle);
};

interface Respuesta {
  status: number;
  body: any;
}

const pedir = async (
  ruta: string,
  opciones: { metodo?: string; token?: string; cuerpo?: unknown } = {}
): Promise<Respuesta> => {
  const res = await fetch(`${BASE}${ruta}`, {
    method: opciones.metodo ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}),
    },
    ...(opciones.cuerpo ? { body: JSON.stringify(opciones.cuerpo) } : {}),
  });
  const texto = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(texto);
  } catch {
    body = texto;
  }
  return { status: res.status, body };
};

const entrar = async (email: string, password: string): Promise<Respuesta> =>
  pedir("/api/auth/login", { metodo: "POST", cuerpo: { email, password } });

const main = async () => {
  // Esta comprobación va ANTES de conectar, y no es un detalle: el script
  // empieza con un `dropDatabase()`. Sin la guarda, un `pnpm verificar:usuarios`
  // lanzado sin variables de entorno cargaría el `.env` —que apunta a la base
  // de producción— y borraría el catálogo, los comprobantes y las cuentas
  // reales. Es el mismo tipo de accidente que el `seed.ts` de la línea 186.
  //
  // Se exige el host explícitamente: la URI por defecto del proyecto NO sirve.
  const uri = process.env.MONGODB_URI ?? "";
  const esLocal =
    uri.includes("127.0.0.1") || uri.includes("localhost") || uri.includes("mongo:27017");
  if (!esLocal) {
    console.error(
      "\nABORTADO: esta verificación BORRA la base contra la que corre.\n" +
        "Solo se permite un Mongo local. Ejemplo:\n\n" +
        "  MONGODB_URI=mongodb://127.0.0.1:27017/jk_verif VERCEL=1 pnpm verificar:usuarios\n"
    );
    process.exit(1);
  }

  await connectDB();

  // Base limpia: si quedó algo de una corrida anterior, fuera.
  await mongoose.connection.db?.dropDatabase();
  await connectDB();

  console.log("\n=== Preparación ===");
  const admin = await User.create({
    name: "Admin de Prueba",
    email: "admin@verif.local",
    password: CLAVE_ADMIN,
    role: "admin",
  });
  console.log(`  admin creado: ${admin.email} (rol ${admin.role})`);

  const servidor = app.listen(PUERTO);
  await new Promise((r) => setTimeout(r, 400));

  try {
    // ─── 1. Regresión: el admin de siempre entra sin pasar por el cambio ───
    console.log("\n=== 1. El admin existente no se ve afectado ===");
    const loginAdmin = await entrar("admin@verif.local", CLAVE_ADMIN);
    comprobar("login del admin responde 200", loginAdmin.status === 200, `status ${loginAdmin.status}`);
    comprobar(
      "el admin NO trae debeCambiarPassword (default false)",
      loginAdmin.body?.data?.user?.debeCambiarPassword === false,
      `valor: ${JSON.stringify(loginAdmin.body?.data?.user?.debeCambiarPassword)}`
    );
    const tokenAdmin: string = loginAdmin.body?.data?.token;
    comprobar("el admin recibe token", typeof tokenAdmin === "string" && tokenAdmin.length > 20);

    // ─── 2. Alta desde el panel ───
    console.log("\n=== 2. Alta de un trabajador desde el panel ===");
    const alta = await pedir("/api/users", {
      metodo: "POST",
      token: tokenAdmin,
      cuerpo: { name: "Trabajador de Prueba", email: "trabajador@verif.local", role: "trabajador" },
    });
    comprobar("POST /api/users responde 201", alta.status === 201, `status ${alta.status}`);
    const claveTemporal: string = alta.body?.data?.passwordTemporal;
    comprobar(
      "devuelve la contraseña temporal",
      typeof claveTemporal === "string" && claveTemporal.length === 16,
      `largo ${claveTemporal?.length}`
    );
    comprobar(
      "el hash NO viaja en la respuesta",
      !JSON.stringify(alta.body).includes("$2") && !("password" in (alta.body?.data?.usuario ?? {})),
      "sin bcrypt en el cuerpo"
    );
    const idTrabajador: string = alta.body?.data?.usuario?._id;

    // Estado en la base
    const doc = await User.findById(idTrabajador).select("+password");
    comprobar("en Mongo queda debeCambiarPassword: true", doc?.debeCambiarPassword === true);
    comprobar("en Mongo queda activo: true", doc?.activo === true);
    comprobar(
      "creadoPor apunta al admin que lo creó",
      doc?.creadoPor?.toString() === admin._id.toString()
    );
    const dias = doc?.passwordTemporalExpira
      ? (doc.passwordTemporalExpira.getTime() - Date.now()) / 86400000
      : -1;
    comprobar("la temporal caduca en ~7 días", dias > 6.9 && dias < 7.01, `${dias.toFixed(2)} días`);
    comprobar(
      "la contraseña en claro NO está guardada",
      doc?.password !== claveTemporal && doc?.password?.startsWith("$2") === true,
      "solo hay hash bcrypt"
    );

    // ─── 3. Primer login: aterriza en el cambio ───
    console.log("\n=== 3. Primer login del trabajador ===");
    const loginTrabajador = await entrar("trabajador@verif.local", claveTemporal);
    comprobar("login con la temporal responde 200", loginTrabajador.status === 200);
    const tokenTemporal: string = loginTrabajador.body?.data?.token;
    comprobar(
      "el perfil dice debeCambiarPassword: true (el frontend lo manda a /cambio-password)",
      loginTrabajador.body?.data?.user?.debeCambiarPassword === true
    );

    // ─── 4. El gate no se puede saltar ───
    console.log("\n=== 4. El gate de la contraseña temporal ===");
    const perfilExento = await pedir("/api/auth/profile", { token: tokenTemporal });
    comprobar(
      "GET /api/auth/profile con token temporal → 200 (ruta exenta)",
      perfilExento.status === 200,
      `status ${perfilExento.status}`
    );

    const comprobantesBloqueado = await pedir("/api/comprobantes", { token: tokenTemporal });
    comprobar(
      "GET /api/comprobantes con token temporal → 403 PASSWORD_TEMPORAL",
      comprobantesBloqueado.status === 403 &&
        comprobantesBloqueado.body?.codigo === "PASSWORD_TEMPORAL",
      `status ${comprobantesBloqueado.status}, codigo ${comprobantesBloqueado.body?.codigo}`
    );

    const usuariosBloqueado = await pedir("/api/users", { token: tokenTemporal });
    comprobar(
      "GET /api/users con token temporal → 403",
      usuariosBloqueado.status === 403,
      `status ${usuariosBloqueado.status} (${usuariosBloqueado.body?.message})`
    );

    const patchBloqueado = await pedir(`/api/comprobantes/${idTrabajador}`, {
      metodo: "PATCH",
      token: tokenTemporal,
      cuerpo: { estado: "aprobado" },
    });
    comprobar(
      "PATCH /api/comprobantes/:id con token temporal → 403",
      patchBloqueado.status === 403,
      `status ${patchBloqueado.status}`
    );

    const publico = await pedir("/api/products");
    comprobar(
      "GET /api/products anónimo → 200 (las rutas públicas siguen abiertas)",
      publico.status === 200,
      `status ${publico.status}`
    );

    // El gate exime por PATH, sin mirar el método. Eso hizo pensar que
    // `HEAD /api/auth/profile` u otro verbo sobre una ruta exenta lo saltaban.
    // No es así: Express solo despacha a un handler si hay uno registrado para
    // ese verbo, y las rutas de datos solo tienen el suyo. Se deja comprobado
    // para que nadie lo "arregle" partiendo de una sospecha sin fundamento.
    const headDatos = await fetch(`${BASE}/api/comprobantes`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${tokenTemporal}` },
    });
    comprobar(
      "HEAD sobre una ruta de datos → 403 (la exención por path no abre otros verbos)",
      headDatos.status === 403,
      `status ${headDatos.status}`
    );

    // El único HEAD que sí se atiende es el de la ruta exenta legítima, y su
    // cuerpo lo recorta Express: solo se filtra el tamaño, no el contenido.
    const headPerfil = await fetch(`${BASE}/api/auth/profile`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${tokenTemporal}` },
    });
    comprobar(
      "HEAD sobre la ruta exenta da 200 sin cuerpo (solo revela el tamaño)",
      headPerfil.status === 200 && (await headPerfil.text()) === "",
      `status ${headPerfil.status}`
    );

    const gate403 = await fetch(`${BASE}/api/comprobantes`, {
      headers: { Authorization: `Bearer ${tokenTemporal}` },
    });
    comprobar(
      "el 403 del gate no se puede cachear (Cache-Control: no-store)",
      (gate403.headers.get("cache-control") ?? "").includes("no-store"),
      `cache-control: ${gate403.headers.get("cache-control")}`
    );

    const servicio = await pedir("/api/comprobantes", {
      metodo: "POST",
      cuerpo: { cliente: "x" },
    });
    comprobar(
      "POST /api/comprobantes sin service key → 401 (la ingesta de n8n intacta)",
      servicio.status === 401,
      `status ${servicio.status}`
    );

    // El caso que de verdad importa del gate: un ADMIN con contraseña temporal.
    // Su rol le da paso en `accessControl`, así que si el gate no lo frenara,
    // tendría todo el panel en la mano con una credencial que circuló por
    // fuera. Es el único caso donde `exigirPasswordCambiada` es la última red.
    const adminTemp = await User.create({
      name: "Admin Temporal",
      email: "admin.temp@verif.local",
      password: "TemporalDelAdmin2026!",
      role: "admin",
      debeCambiarPassword: true,
      passwordTemporalExpira: new Date(Date.now() + 7 * 86400000),
    });
    const loginAdminTemp = await entrar("admin.temp@verif.local", "TemporalDelAdmin2026!");
    comprobar("el admin temporal entra (200)", loginAdminTemp.status === 200);
    const tokenAdminTemp: string = loginAdminTemp.body?.data?.token;

    const usuariosAdminTemp = await pedir("/api/users", { token: tokenAdminTemp });
    comprobar(
      "un ADMIN con temporal NO puede usar /api/users (el rol solo no basta) → 403 PASSWORD_TEMPORAL",
      usuariosAdminTemp.status === 403 && usuariosAdminTemp.body?.codigo === "PASSWORD_TEMPORAL",
      `status ${usuariosAdminTemp.status}, codigo ${usuariosAdminTemp.body?.codigo}`
    );
    const crearAdminTemp = await pedir("/api/users", {
      metodo: "POST",
      token: tokenAdminTemp,
      cuerpo: { name: "Colado", email: "colado@verif.local", role: "admin" },
    });
    comprobar(
      "tampoco puede crear otro admin → 403",
      crearAdminTemp.status === 403,
      `status ${crearAdminTemp.status}`
    );
    // La cuenta "colado" no debe existir.
    comprobar(
      "y de hecho no se creó ninguna cuenta",
      (await User.findOne({ email: "colado@verif.local" })) === null
    );
    await adminTemp.deleteOne();

    // ─── 5. Cambio de contraseña ───
    console.log("\n=== 5. Cambio de la contraseña temporal ===");
    const igual = await pedir("/api/auth/change-password", {
      metodo: "POST",
      token: tokenTemporal,
      cuerpo: {
        passwordActual: claveTemporal,
        passwordNueva: claveTemporal,
        confirmarPassword: claveTemporal,
      },
    });
    comprobar(
      "cambiar la temporal por ella misma → rechazado",
      igual.status === 400,
      `status ${igual.status} (${igual.body?.message})`
    );

    const noCoinciden = await pedir("/api/auth/change-password", {
      metodo: "POST",
      token: tokenTemporal,
      cuerpo: {
        passwordActual: claveTemporal,
        passwordNueva: "ClaveNuevaLarga2026!",
        confirmarPassword: "OtraCosaDistinta2026!",
      },
    });
    comprobar(
      "confirmación que no coincide → 400",
      noCoinciden.status === 400,
      `status ${noCoinciden.status}`
    );

    const corta = await pedir("/api/auth/change-password", {
      metodo: "POST",
      token: tokenTemporal,
      cuerpo: {
        passwordActual: claveTemporal,
        passwordNueva: "corta123",
        confirmarPassword: "corta123",
      },
    });
    comprobar("contraseña nueva de menos de 12 → 400", corta.status === 400, `status ${corta.status}`);

    const CLAVE_NUEVA = "ClaveNuevaLarga2026!";
    const cambio = await pedir("/api/auth/change-password", {
      metodo: "POST",
      token: tokenTemporal,
      cuerpo: {
        passwordActual: claveTemporal,
        passwordNueva: CLAVE_NUEVA,
        confirmarPassword: CLAVE_NUEVA,
      },
    });
    comprobar("cambio válido → 200", cambio.status === 200, `status ${cambio.status}`);

    const docDespues = await User.findById(idTrabajador);
    comprobar("en Mongo el flag queda en false", docDespues?.debeCambiarPassword === false);
    comprobar("se limpia passwordTemporalExpira", docDespues?.passwordTemporalExpira === undefined);
    comprobar(
      "sube tokenVersion (1)",
      docDespues?.tokenVersion === 1,
      `tokenVersion: ${docDespues?.tokenVersion}`
    );

    // ─── 6. "Volver a iniciar sesión" de verdad ───
    console.log("\n=== 6. El token anterior deja de valer ===");
    const tokenViejo = await pedir("/api/comprobantes", { token: tokenTemporal });
    comprobar(
      "reusar el token de la temporal → 401 (no basta limpiar localStorage)",
      tokenViejo.status === 401,
      `status ${tokenViejo.status} (${tokenViejo.body?.message})`
    );
    const perfilViejo = await pedir("/api/auth/profile", { token: tokenTemporal });
    comprobar("ese mismo token tampoco sirve en /profile → 401", perfilViejo.status === 401, `status ${perfilViejo.status}`);

    // ─── 7. Login con la contraseña nueva ───
    console.log("\n=== 7. Login con la contraseña nueva ===");
    const loginNuevo = await entrar("trabajador@verif.local", CLAVE_NUEVA);
    comprobar("login con la nueva → 200", loginNuevo.status === 200, `status ${loginNuevo.status}`);
    comprobar(
      "el perfil ya no pide cambio",
      loginNuevo.body?.data?.user?.debeCambiarPassword === false
    );
    const tokenNuevo: string = loginNuevo.body?.data?.token;
    const comprobantesOk = await pedir("/api/comprobantes", { token: tokenNuevo });
    comprobar(
      "con la nueva, GET /api/comprobantes → 200",
      comprobantesOk.status === 200,
      `status ${comprobantesOk.status}`
    );
    const temporalYaNoSirve = await entrar("trabajador@verif.local", claveTemporal);
    comprobar(
      "la contraseña temporal ya no entra → 401",
      temporalYaNoSirve.status === 401,
      `status ${temporalYaNoSirve.status}`
    );

    // ─── 8. Bajas ───
    console.log("\n=== 8. Desactivar y reactivar ===");
    const autoBaja = await pedir(`/api/users/${admin._id}/activo`, {
      metodo: "PATCH",
      token: tokenAdmin,
      cuerpo: { activo: false },
    });
    comprobar(
      "desactivarse a uno mismo → 400",
      autoBaja.status === 400,
      `status ${autoBaja.status} (${autoBaja.body?.message})`
    );

    const baja = await pedir(`/api/users/${idTrabajador}/activo`, {
      metodo: "PATCH",
      token: tokenAdmin,
      cuerpo: { activo: false },
    });
    comprobar("desactivar al trabajador → 200", baja.status === 200, `status ${baja.status}`);

    const loginDesactivado = await entrar("trabajador@verif.local", CLAVE_NUEVA);
    comprobar(
      "una cuenta desactivada no entra → 403 con mensaje claro",
      loginDesactivado.status === 403 &&
        String(loginDesactivado.body?.message ?? "").includes("desactivada"),
      `status ${loginDesactivado.status} (${loginDesactivado.body?.message})`
    );

    const tokenDeDesactivado = await pedir("/api/comprobantes", { token: tokenNuevo });
    comprobar(
      "su token deja de servir de inmediato → 401",
      tokenDeDesactivado.status === 401,
      `status ${tokenDeDesactivado.status}`
    );

    const reactivar = await pedir(`/api/users/${idTrabajador}/activo`, {
      metodo: "PATCH",
      token: tokenAdmin,
      cuerpo: { activo: true },
    });
    comprobar("reactivar → 200", reactivar.status === 200, `status ${reactivar.status}`);
    const loginReactivado = await entrar("trabajador@verif.local", CLAVE_NUEVA);
    comprobar("vuelve a entrar → 200", loginReactivado.status === 200, `status ${loginReactivado.status}`);

    // ─── 9. Caducidad y regeneración ───
    console.log("\n=== 9. Caducidad de la temporal y regeneración ===");
    const regenerado = await pedir(`/api/users/${idTrabajador}/password-temporal`, {
      metodo: "POST",
      token: tokenAdmin,
    });
    comprobar("regenerar la temporal → 200", regenerado.status === 200, `status ${regenerado.status}`);
    const claveRegenerada: string = regenerado.body?.data?.passwordTemporal;
    comprobar(
      "devuelve una temporal nueva distinta",
      typeof claveRegenerada === "string" && claveRegenerada !== claveTemporal
    );

    const docRegenerado = await User.findById(idTrabajador).select("+password");
    comprobar(
      "la regeneración vuelve a exigir el cambio",
      docRegenerado?.debeCambiarPassword === true
    );
    comprobar(
      "y cierra la sesión abierta (tokenVersion sube)",
      docRegenerado?.tokenVersion === 2,
      `tokenVersion: ${docRegenerado?.tokenVersion}`
    );
    const sesionCerrada = await pedir("/api/comprobantes", { token: tokenNuevo });
    comprobar(
      "el token que estaba usando ya no vale → 401",
      sesionCerrada.status === 401,
      `status ${sesionCerrada.status}`
    );

    // Caducar la temporal a mano y comprobar que el login la rechaza.
    await User.findByIdAndUpdate(idTrabajador, {
      passwordTemporalExpira: new Date(Date.now() - 1000),
      debeCambiarPassword: true,
    });
    const loginCaducado = await entrar("trabajador@verif.local", claveRegenerada);
    comprobar(
      "una temporal caducada no entra → 403 pidiendo regenerarla",
      loginCaducado.status === 403 &&
        String(loginCaducado.body?.message ?? "").includes("caduc"),
      `status ${loginCaducado.status} (${loginCaducado.body?.message})`
    );

    // ─── 10. Guardas del servicio de usuarios ───
    console.log("\n=== 10. Guardas de la gestión de usuarios ===");
    const repetido = await pedir("/api/users", {
      metodo: "POST",
      token: tokenAdmin,
      cuerpo: { name: "Otro", email: "trabajador@verif.local", role: "trabajador" },
    });
    comprobar(
      "correo repetido → 409 con mensaje entendible",
      repetido.status === 409 && String(repetido.body?.message ?? "").includes("Ya existe"),
      `status ${repetido.status} (${repetido.body?.message})`
    );

    const rolInvalido = await pedir("/api/users", {
      metodo: "POST",
      token: tokenAdmin,
      cuerpo: { name: "Malo", email: "malo@verif.local", role: "superadmin" },
    });
    comprobar(
      "rol inventado → 400 (no se puede escalar privilegios)",
      rolInvalido.status === 400,
      `status ${rolInvalido.status}`
    );

    const sinToken = await pedir("/api/users");
    comprobar("GET /api/users sin token → 401", sinToken.status === 401, `status ${sinToken.status}`);

    const listado = await pedir("/api/users", { token: tokenAdmin });
    comprobar(
      "el listado no expone el hash",
      listado.status === 200 && !JSON.stringify(listado.body).includes("$2"),
      "sin bcrypt en la respuesta"
    );
  } finally {
    servidor.close();
    await mongoose.connection.close();
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${pasadas} pasadas, ${falladas} falladas`);
  console.log(`${"─".repeat(60)}\n`);
  process.exit(falladas === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error("\nLa verificación se rompió:", error);
  process.exit(1);
});
