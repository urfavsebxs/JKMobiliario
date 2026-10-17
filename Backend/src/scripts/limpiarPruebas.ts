import mongoose from "mongoose";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { connectDB } from "../config/database";
import { config } from "../config";
import { getPrivateObjectStream, removePrivateObject } from "../config/minio";
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
 * **Antes de borrar, copia.** Los documentos van a un JSON y las imágenes se
 * descargan del bucket privado, todo a `ops/respaldos/comprobantes-<fecha>/`
 * (o al directorio que diga `--respaldo`). Borrar un comprobante no se deshace,
 * y un comprobante aprobado con nombre, teléfono y monto puede ser el único
 * rastro de un pago real: si la copia no se puede escribir, NO se borra.
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

const marca = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const indiceRespaldo = argumentos.indexOf("--respaldo");
const dirRespaldo =
  indiceRespaldo >= 0 && argumentos[indiceRespaldo + 1]
    ? argumentos[indiceRespaldo + 1]
    : path.join("..", "ops", "respaldos", `comprobantes-${marca}`);

/** Acceso directo a la colección de memoria de n8n, sin pasar por el modelo. */
const coleccionMemoria = () =>
  mongoose.connection.getClient().db(BASE_N8N).collection(COLECCION_MEMORIA);

const fecha = (valor: Date | undefined) =>
  valor ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(valor) : "—";

const inventarioComprobantes = async () => {
  const total = await Comprobante.countDocuments({});

  console.log(`\n═══ COMPROBANTES ═══`);
  console.log(`Documentos en la colección: ${total}`);

  if (total === 0) return { total: 0, docs: [] as Awaited<ReturnType<typeof Comprobante.find>> };

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
  console.log(`  Imágenes en el bucket privado "${config.minioBucketComprobantes}": ${docs.length}`);
  return { total, docs };
};

/**
 * Deja una copia de los comprobantes antes de borrarlos: los documentos en un
 * JSON y las imágenes descargadas del bucket privado.
 *
 * Si algo falla aquí, el script aborta sin borrar. Una copia a medias sería
 * peor que no tenerla, porque daría por respaldado lo que no lo está.
 */
const respaldar = async (docs: Record<string, unknown>[]): Promise<void> => {
  await fs.mkdir(dirRespaldo, { recursive: true });

  await fs.writeFile(
    path.join(dirRespaldo, "comprobantes.json"),
    JSON.stringify(docs, null, 2),
    "utf8"
  );

  const carpetaImagenes = path.join(dirRespaldo, "imagenes");
  await fs.mkdir(carpetaImagenes, { recursive: true });

  let copiadas = 0;
  for (const doc of docs) {
    const key = doc.imagenKey as string;
    if (!key) continue;
    // El nombre del objeto ya es único (`<ms>-<hex>.jpg`); se aplana con el
    // teléfono delante para poder reconocer la copia sin abrir el JSON.
    const destino = path.join(carpetaImagenes, `${String(doc.telefono ?? "sin")}__${path.basename(key)}`);
    const stream = await getPrivateObjectStream(key);
    // `pipeline` y no `writeFile`: el objeto llega como stream, y volcarlo a
    // memoria para escribirlo haría que una imagen grande se comiera la RAM del
    // servidor sin necesidad.
    await pipeline(stream, createWriteStream(destino));
    copiadas++;
  }

  const sesionesJson = await coleccionMemoria()
    .find({ sessionId: { $in: sesiones } })
    .toArray()
    .catch(() => []);
  if (sesionesJson.length > 0) {
    await fs.writeFile(
      path.join(dirRespaldo, "sesiones-n8n.json"),
      JSON.stringify(sesionesJson, null, 2),
      "utf8"
    );
  }

  console.log(`  Respaldo en ${path.resolve(dirRespaldo)}`);
  console.log(`    ${docs.length} documentos, ${copiadas} imágenes, ${sesionesJson.length} sesiones`);
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

  const { docs } = await inventarioComprobantes();
  const sesionesEncontradas = await inventarioSesiones();

  if (!borrar) {
    console.log(`\nNo se borró nada. Para borrar: --borrar [--sesion <id> ...]\n`);
    await mongoose.disconnect();
    return;
  }

  console.log(`\n═══ RESPALDO ═══`);
  // Si el respaldo falla, se lanza y no se borra nada: es la red de seguridad.
  await respaldar(docs as unknown as Record<string, unknown>[]);

  console.log(`\n═══ BORRANDO ═══`);

  // Primero las imágenes y después los documentos: al revés, un fallo a mitad
  // dejaría documentos apuntando a imágenes que ya no existen, y el panel
  // mostraría comprobantes rotos.
  let imagenesBorradas = 0;
  let imagenesFallidas = 0;
  for (const doc of docs) {
    const key = (doc as { imagenKey?: string }).imagenKey;
    if (!key) continue;
    try {
      await removePrivateObject(key);
      imagenesBorradas++;
    } catch (error) {
      imagenesFallidas++;
      console.log(`  imagen ${key}: ${(error as Error).message}`);
    }
  }
  console.log(`  Imágenes borradas: ${imagenesBorradas}/${docs.length} (fallidas: ${imagenesFallidas})`);

  const resultado = await Comprobante.deleteMany({});
  console.log(`  Comprobantes borrados: ${resultado.deletedCount}`);

  for (const sesion of sesionesEncontradas) {
    const res = await coleccionMemoria().deleteOne({ sessionId: sesion });
    console.log(`  Sesión ${sesion} borrada: ${res.deletedCount}`);
  }

  console.log(`\nListo. Respaldo en ${path.resolve(dirRespaldo)}\n`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Falló la limpieza:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
