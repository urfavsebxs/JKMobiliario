// Limpia de la memoria de chat del asesor la fontaneria que escribe n8n.
//
// POR QUE EXISTE
// Cuando el agente usa una herramienta, n8n guarda TRES cosas por llamada (ver
// `memoryManagement.js`, funcion `saveToMemory`): el mensaje del modelo con
// `tool_calls`, la observacion cruda de la herramienta (`type: "tool"`, que en
// este flujo es la respuesta de envio de Meta y llega a 4 KB) y la respuesta
// final. Las dos primeras no son conversacion.
//
// QUE SE PIERDE Y QUE NO
// Solo se quitan mensajes SIN TEXTO: la observacion de la herramienta y el
// mensaje del modelo que unicamente la invoca. Nada de lo que dice el cliente ni
// nada de lo que responde el asesor se toca. En la practica, el par que se quita
// deja la secuencia `human > ai(texto)` donde antes habia
// `human > ai(vacio+tool_call) > tool > ai(texto)`: se recuperan 2 de las 15
// ranuras de `contextWindowLength` por cada llamada a herramienta.
//
// Quitar SOLO el `tool` seria peor que no hacer nada: dejaria dos mensajes `ai`
// seguidos, que es una secuencia que los modelos rechazan. Por eso van en pareja.
//
// POR QUE NO VIVE DENTRO DE n8n
// No se puede: el nodo de MongoDB solo construye `$set` a partir de `fields` (no
// hace `$pull`), y un Code node no puede cargar el driver porque la instancia no
// tiene `NODE_FUNCTION_ALLOW_EXTERNAL`. De ahi el cron.
//
// USO
//   mongosh "<uri>" --quiet limpiar-volcados-memoria.js         -> modo seco
//   DRY=0 mongosh "<uri>" --quiet limpiar-volcados-memoria.js   -> aplica
//
// Es idempotente y conservador: si no hay nada que quitar no escribe nada, y si
// detecta que la forma de los datos cambio (Mongo selecciona un documento que el
// predicado de JS no reconoce) se niega a tocar esa coleccion en vez de borrar a
// ciegas.

const DRY = process.env.DRY !== "0";
const COLS = ["n8n_memory", "n8n_memory_fb", "n8n_memory_ig", "n8n_test_memory"];

// "Sin texto" incluye el array vacio: en estos mensajes `data.content` NO es ""
// sino `[]`, porque los modelos devuelven el contenido troceado. Comprobar solo
// la cadena vacia deja fuera justo los mensajes que hay que quitar.
const sinTexto = (c) =>
  c === "" || c === null || c === undefined || (Array.isArray(c) && c.length === 0);

const esVolcado = (m) => {
  if (!m) return false;
  if (m.type === "tool") return true;
  if (m.type === "ai") {
    const tc = m.data && m.data.tool_calls;
    return Array.isArray(tc) && tc.length > 0 && sinTexto(m.data && m.data.content);
  }
  return false;
};

// La misma condicion, en sintaxis de consulta, para que la ejecute Mongo.
const ES_VOLCADO = {
  $or: [
    { type: "tool" },
    { $and: [
      { type: "ai" },
      { "data.tool_calls.0": { $exists: true } },
      { $or: [
        { "data.content": "" },
        { "data.content": null },
        { "data.content": { $exists: false } },
        { "data.content": { $size: 0 } },
      ] },
    ] },
  ],
};

const bytes = (s) => (typeof s === "string" ? s.length : 0);

print("MODO: " + (DRY ? "SECO (no escribe nada)" : "APLICANDO CAMBIOS"));

let totalDocs = 0, totalMensajes = 0, totalBytes = 0, totalAplicados = 0;

for (const nombre of COLS) {
  const col = db.getCollection(nombre);
  if (col.countDocuments() === 0) continue;

  const filtro = { messages: { $elemMatch: ES_VOLCADO } };
  const docs = col.find(filtro).toArray();

  let malos = 0, byts = 0, desajuste = 0;
  for (const d of docs) {
    const enJs = (d.messages || []).filter(esVolcado);
    if (enJs.length === 0) desajuste++;
    malos += enJs.length;
    byts += enJs.reduce((a, m) => a + bytes(m.data && m.data.content), 0);
  }

  print("=== " + nombre + " ===");
  print("  documentos=" + col.countDocuments() + "  afectados=" + docs.length +
        "  mensajes a quitar=" + malos + "  bytes=" + byts);

  if (desajuste > 0) {
    print("  AVISO: " + desajuste + " documento(s) seleccionados por Mongo que el predicado JS no" +
          " reconoce. NO se toca esta coleccion.");
    continue;
  }

  if (!DRY && docs.length > 0) {
    const r = col.updateMany(filtro, { $pull: { messages: ES_VOLCADO } });
    print("  aplicado: coincidencias=" + r.matchedCount + " modificados=" + r.modifiedCount);
    totalAplicados += r.modifiedCount;
  }

  totalDocs += docs.length;
  totalMensajes += malos;
  totalBytes += byts;
}

print("TOTAL: documentos afectados=" + totalDocs + "  mensajes=" + totalMensajes +
      "  bytes=" + totalBytes + (DRY ? "" : "  modificados=" + totalAplicados));
