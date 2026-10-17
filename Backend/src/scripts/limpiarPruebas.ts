import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { config } from "../config";
import { removePrivateObject } from "../config/minio";
import { Comprobante } from "../models/Comprobante";

/**
 * Borra datos de PRUEBA de la base de producción.
 *
 * Existe porque hay dos cosas que se llenan de basura y no tienen ruta que las
 * borre: los comprobantes que se subieron probando la cadena de la foto, y las
 * conversaciones que dejan las pruebas del asesor de WhatsApp en la memoria de
 * n8n (aparecen en /admin/conversaciones como si fueran clientes).
 *
 * **Sin `--borrar` no borra nada: hace un inventario.** Es a propósito — el
 * script se ejecuta contra la base real, y la única forma de no borrar por
 * error lo que no era de prueba es ver primero lo que hay.
 *
 *   npx tsx src/scripts/limpiarPruebas.ts
 *   npx tsx src/scripts/limpiarPruebas.ts --borrar
 *   npx tsx src/scripts/limpiarPruebas.ts --borrar --sesion 573000000000
 *
 * `--sesion` se puede repetir. Solo toca la memoria de n8n; el script nunca
 * borra fichas de cliente ni nada de las otras colecciones.
 */

const BASE_N8N = "n8n_data";
const COLECCION_MEMORIA = "n8n_memory";

const argumentos = process.argv.slice(2);
const borrar = argumentos.includes("--borrar");

const sesiones: string[] = [];
for (let i = 0; i < argumentos.length; i++) {
  if (argumentos[i] === "--sesion" && argumentos[i + 1]) sesiones.push(argumentos[i + 1]);
}

/** Acceso directo a la colección de memoria de n8n, sin pasar por el modelo. */
const coleccionMemoria = () =>
  mongoose.connection.getClient().db(BASE_N8N).collection(COLECCION_MEMORIA);

const fecha = (valor: Date | undefined) =>
  valor ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(valor) : "—";

const inventarioComprobantes = async () => {
  const total = await Comprobante.countDocuments({});

  console.log(`\n═══ COMPROBANTES ═══`);
  console.log(`Documentos en la colección: ${total}`);

  if (total === 0) return { total: 0, keys: [] as string[] };

  // El inventario va completo y en crudo a propósito: es lo último que se ve
  // antes de borrar, y aquí lo que importa es poder reconocer si algo NO era de
  // prueba (un monto redondo, un teléfono que no sea el de las pruebas).
  const docs = await Comprobante.find({}).sort({ createdAt: 1 }).lean();
  for (const doc of docs) {
    console.log(
      `  · ${fecha(doc.createdAt)} | ${doc.estado ?? "?"} | ${
        doc.monto != null ? `$ ${doc.monto}` : "sin monto"
      } | tel ${doc.telefono ?? "—"} | ${doc.nombreCliente ?? doc.nombrePerfilWhatsApp ?? "sin nombre"} | ${
        doc.imagenKey
      }`
    );
  }

  const porEstado = await Comprobante.aggregate([{ $group: { _id: "$estado", n: { $sum: 1 } } }]);
  console.log(`  Estados: ${porEstado.map((e) => `${e._id}=${e.n}`).join(", ")}`);

  const keys = docs.map((doc) => doc.imagenKey).filter(Boolean);
  console.log(`  Imágenes en el bucket privado "${config.minioBucketComprobantes}": ${keys.length}`);
  return { total, keys };
};

const inventarioSesiones = async () => {
  console.log(`\n═══ MEMORIA DE CHAT DE N8N ═══`);

  if (sesiones.length === 0) {
    console.log("  No se pidió ninguna sesión (--sesion <id>). No se toca nada.");
    return [];
  }

  let coleccion;
  try {
    coleccion = coleccionMemoria();
    // Un `estimatedDocumentCount` alcanza para saber si se llegó a la base.
    const total = await coleccion.estimatedDocumentCount();
    console.log(`  Sesiones en ${BASE_N8N}.${COLECCION_MEMORIA}: ${total}`);
  } catch (error) {
    console.log(`  NO se pudo abrir ${BASE_N8N}.${COLECCION_MEMORIA}: ${(error as Error).message}`);
    return [];
  }

  const encontradas: string[] = [];
  for (const sesion of sesiones) {
    const doc = await coleccion.findOne({ sessionId: sesion });
    if (!doc) {
      console.log(`  · ${sesion}: no existe (nada que borrar)`);
      continue;
    }
    const mensajes = Array.isArray(doc.messages) ? doc.messages.length : 0;
    console.log(`  · ${sesion}: ${mensajes} mensajes guardados`);
    encontradas.push(sesion);
  }

  return encontradas;
};

const main = async () => {
  await connectDB();

  console.log(`Modo: ${borrar ? "BORRAR" : "solo inventario (añade --borrar para borrar)"}`);

  const { keys } = await inventarioComprobantes();
  const sesionesEncontradas = await inventarioSesiones();

  if (!borrar) {
    console.log(`\nNo se borró nada. Para borrar: --borrar [--sesion <id> ...]\n`);
    await mongoose.disconnect();
    return;
  }

  console.log(`\n═══ BORRANDO ═══`);

  // Primero las imágenes y después los documentos: al revés, un fallo a mitad
  // dejaría documentos apuntando a imágenes que ya no existen, y el panel
  // mostraría comprobantes rotos.
  let imagenesBorradas = 0;
  for (const key of keys) {
    try {
      await removePrivateObject(key);
      imagenesBorradas++;
    } catch (error) {
      console.log(`  imagen ${key}: ${(error as Error).message}`);
    }
  }
  console.log(`  Imágenes borradas del bucket: ${imagenesBorradas}/${keys.length}`);

  const resultado = await Comprobante.deleteMany({});
  console.log(`  Comprobantes borrados: ${resultado.deletedCount}`);

  for (const sesion of sesionesEncontradas) {
    const res = await coleccionMemoria().deleteOne({ sessionId: sesion });
    console.log(`  Sesión ${sesion} borrada: ${res.deletedCount}`);
  }

  console.log(`\nListo.\n`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Falló la limpieza:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
