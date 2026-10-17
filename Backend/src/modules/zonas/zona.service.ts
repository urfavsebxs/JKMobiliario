import {
  DEPARTAMENTOS_COLOMBIA,
  Departamento,
  ZonaEntrega,
  IZonaEntrega,
} from "../../models/ZonaEntrega";
import { AppError } from "../../middlewares/errorHandler";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/**
 * Municipios que el asesor puede reconocer, con su departamento.
 *
 * No es la lista completa de los 1.103 municipios del país: son las capitales y
 * las ciudades desde donde de verdad escribe la gente. Lo que no esté aquí no
 * se descarta — el dueño puede agregarlo desde el panel, o el asesor pregunta
 * de nuevo — y por eso equivocarse por omisión es barato y por exceso (inventar
 * un municipio) no.
 *
 * Las claves van normalizadas (minúsculas, sin tildes, sin puntos) y son la
 * forma en que la gente escribe de verdad: "bogota", "medellin", "cartagena".
 */
const MUNICIPIOS: Record<string, Departamento> = {
  // Antioquia y su área metropolitana: es donde está la sala de ventas.
  medellin: "Antioquia",
  bello: "Antioquia",
  envigado: "Antioquia",
  itagui: "Antioquia",
  sabaneta: "Antioquia",
  "la estrella": "Antioquia",
  caldas: "Antioquia",
  copacabana: "Antioquia",
  girardota: "Antioquia",
  barbosa: "Antioquia",
  rionegro: "Antioquia",
  "el carmen de viboral": "Antioquia",
  marinilla: "Antioquia",
  guarne: "Antioquia",
  apartado: "Antioquia",
  turbo: "Antioquia",
  caucasia: "Antioquia",
  "puerto berrio": "Antioquia",
  segovia: "Antioquia",
  "santa fe de antioquia": "Antioquia",
  urrao: "Antioquia",
  yarumal: "Antioquia",
  // Bogotá y la sabana
  bogota: "Bogotá D.C.",
  "bogota dc": "Bogotá D.C.",
  "bogota d c": "Bogotá D.C.",
  "santa fe de bogota": "Bogotá D.C.",
  soacha: "Cundinamarca",
  chia: "Cundinamarca",
  zipaquira: "Cundinamarca",
  facatativa: "Cundinamarca",
  fusagasuga: "Cundinamarca",
  girardot: "Cundinamarca",
  "la calera": "Cundinamarca",
  mosquera: "Cundinamarca",
  madrid: "Cundinamarca",
  funza: "Cundinamarca",
  cajica: "Cundinamarca",
  sogamoso: "Boyacá",
  duitama: "Boyacá",
  tunja: "Boyacá",
  chiquinquira: "Boyacá",
  // Caribe
  barranquilla: "Atlántico",
  soledad: "Atlántico",
  "puerto colombia": "Atlántico",
  sabanalarga: "Atlántico",
  cartagena: "Bolívar",
  "cartagena de indias": "Bolívar",
  magangue: "Bolívar",
  "el carmen de bolivar": "Bolívar",
  monteria: "Córdoba",
  sahagun: "Córdoba",
  lorica: "Córdoba",
  cerete: "Córdoba",
  sincelejo: "Sucre",
  corozal: "Sucre",
  "san marcos": "Sucre",
  valledupar: "Cesar",
  aguachica: "Cesar",
  "agustin codazzi": "Cesar",
  riohacha: "La Guajira",
  maicao: "La Guajira",
  "san juan del cesar": "La Guajira",
  "santa marta": "Magdalena",
  cienaga: "Magdalena",
  fundacion: "Magdalena",
  // Occidente
  cali: "Valle del Cauca",
  palmira: "Valle del Cauca",
  buenaventura: "Valle del Cauca",
  tulua: "Valle del Cauca",
  cartago: "Valle del Cauca",
  buga: "Valle del Cauca",
  yumbo: "Valle del Cauca",
  jamundi: "Valle del Cauca",
  roldanillo: "Valle del Cauca",
  pradera: "Valle del Cauca",
  florida: "Valle del Cauca",
  "la union": "Valle del Cauca",
  pereira: "Risaralda",
  dosquebradas: "Risaralda",
  "santa rosa de cabal": "Risaralda",
  manizales: "Caldas",
  "la dorada": "Caldas",
  riosucio: "Caldas",
  armenia: "Quindío",
  calarca: "Quindío",
  "la tebaida": "Quindío",
  // Centro y sur
  ibague: "Tolima",
  espinal: "Tolima",
  melgar: "Tolima",
  guamo: "Tolima",
  neiva: "Huila",
  pitalito: "Huila",
  garzon: "Huila",
  "la plata": "Huila",
  popayan: "Cauca",
  "santander de quilichao": "Cauca",
  patia: "Cauca",
  pasto: "Nariño",
  ipiales: "Nariño",
  tumaco: "Nariño",
  tuquerres: "Nariño",
  // Oriente
  bucaramanga: "Santander",
  floridablanca: "Santander",
  giron: "Santander",
  piedecuesta: "Santander",
  barrancabermeja: "Santander",
  "san gil": "Santander",
  socorro: "Santander",
  cucuta: "Norte de Santander",
  ocana: "Norte de Santander",
  pamplona: "Norte de Santander",
  "villa del rosario": "Norte de Santander",
  // Llanos
  villavicencio: "Meta",
  acacias: "Meta",
  "puerto lopez": "Meta",
  yopal: "Casanare",
  aguazul: "Casanare",
  arauca: "Arauca",
  saravena: "Arauca",
  tame: "Arauca",
  // Amazonía y selva
  florencia: "Caquetá",
  "san vicente del caguan": "Caquetá",
  mocoa: "Putumayo",
  "puerto asis": "Putumayo",
  "valle del guamuez": "Putumayo",
  "san jose del guaviare": "Guaviare",
  mitu: "Vaupés",
  "puerto carreno": "Vichada",
  inirida: "Guainía",
  leticia: "Amazonas",
  quibdo: "Chocó",
  istmina: "Chocó",
  // Insular
  "san andres": "San Andrés y Providencia",
  providencia: "San Andrés y Providencia",
};

/**
 * Normaliza un texto de ubicación: minúsculas, sin tildes, sin puntuación y con
 * espacios simples. "Medellín, Antioquia." → "medellin antioquia".
 *
 * Se quitan los puntos porque la gente escribe "Bogotá D.C." y porque la
 * abreviatura con puntos no debe depender de cómo la teclee cada uno.
 */
export const normalizarUbicacion = (valor: string): string =>
  valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Escapa un texto para usarlo como patrón literal dentro de una RegExp. */
const escaparRegex = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Posición del lugar dentro del texto, o `null` si no aparece.
 *
 * Se exige que la frase aparezca completa y rodeada de límites de palabra: si
 * no, "Cali" entraría dentro de "calima" y "Tame" dentro de "examen".
 */
const posicionDe = (normalizado: string, clave: string): number | null => {
  if (!clave) return null;
  const coincidencia = new RegExp(`(^|\\s)${escaparRegex(clave)}(\\s|$)`).exec(normalizado);
  if (!coincidencia) return null;
  return coincidencia.index + coincidencia[1].length;
};

/** Un lugar reconocido en el texto, con lo que hace falta para decidir la regla. */
interface LugarReconocido {
  departamento: string;
  municipio: string;
  barrio: string;
  /** 1 = departamento, 2 = municipio, 3 = barrio. */
  nivel: 1 | 2 | 3;
  indice: number;
  /** Longitud de lo que se reconoció; desempata entre lugares que empiezan igual. */
  largo: number;
}

/**
 * Reconoce el lugar más específico que aparece en lo que escribió el cliente.
 *
 * Se buscan TODOS los lugares conocidos —los del diccionario base y los que el
 * dueño agregó en el panel— y gana el más específico (barrio > municipio >
 * departamento). Entre dos del mismo nivel, el que aparece primero en el texto;
 * si empiezan en el mismo punto, el nombre más largo.
 *
 * Así "Medellín, barrio Belén" resuelve por Belén y no por Medellín, y "Norte
 * de Santander" no se confunde con Santander, que es un departamento distinto y
 * va contenido en él.
 */
export const reconocerUbicacion = (
  texto: string,
  zonas: IZonaEntrega[]
): LugarReconocido | null => {
  const normalizado = normalizarUbicacion(texto);
  if (!normalizado) return null;

  const candidatos: LugarReconocido[] = [];

  const agregar = (
    departamento: string,
    municipio: string,
    barrio: string,
    nivel: 1 | 2 | 3,
    claveCruda: string
  ) => {
    const clave = normalizarUbicacion(claveCruda);
    const indice = posicionDe(normalizado, clave);
    if (indice === null) return;
    candidatos.push({
      departamento,
      municipio,
      barrio,
      nivel,
      indice,
      largo: clave.length,
    });
  };

  // Lo que el dueño configuró manda: si agregó un barrio o un municipio, es
  // porque quiere decidir sobre él, aunque el nombre choque con el diccionario.
  for (const zona of zonas) {
    if (zona.barrio) agregar(zona.departamento, zona.municipio, zona.barrio, 3, zona.barrio);
    else if (zona.municipio) agregar(zona.departamento, zona.municipio, "", 2, zona.municipio);
  }

  // Diccionario base de municipios: solo aporta el departamento.
  for (const [clave, departamento] of Object.entries(MUNICIPIOS)) {
    agregar(departamento, "", "", 2, clave);
  }

  for (const departamento of DEPARTAMENTOS_COLOMBIA) {
    agregar(departamento, "", "", 1, departamento);
  }
  // "Guajira" a secas es como se le dice al departamento en la calle.
  agregar("La Guajira", "", "", 1, "guajira");

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => b.nivel - a.nivel || a.indice - b.indice || b.largo - a.largo);
  return candidatos[0];
};

/**
 * Crea las filas de departamento que falten, sin tocar las que ya existen.
 *
 * `$setOnInsert` es lo que hace que esto se pueda llamar en cada consulta: si
 * el dueño desactivó un departamento, un sembrado que corriera con `$set`
 * volvería a activarlo y la configuración se perdería sola.
 */
export const asegurarZonas = async (): Promise<void> => {
  await ZonaEntrega.bulkWrite(
    DEPARTAMENTOS_COLOMBIA.map((departamento) => ({
      updateOne: {
        filter: { departamento, municipio: "", barrio: "" },
        update: { $setOnInsert: { departamento, municipio: "", barrio: "", activo: true } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
};

/**
 * Ordena las reglas como las lee una persona: departamento en el orden oficial,
 * y dentro de cada uno lo general antes que lo particular.
 */
const ordenarZonas = (zonas: IZonaEntrega[]): IZonaEntrega[] => {
  const posicion = new Map<string, number>(
    DEPARTAMENTOS_COLOMBIA.map((departamento, indice) => [departamento, indice])
  );
  const porDepartamento = (zona: IZonaEntrega) => posicion.get(zona.departamento) ?? 99;

  return [...zonas].sort(
    (a, b) =>
      porDepartamento(a) - porDepartamento(b) ||
      a.departamento.localeCompare(b.departamento, "es") ||
      a.municipio.localeCompare(b.municipio, "es") ||
      a.barrio.localeCompare(b.barrio, "es")
  );
};

/** Todas las reglas, para la pantalla del panel. Incluye `nota`: es del dueño. */
export const listarZonas = async (): Promise<IZonaEntrega[]> => {
  await asegurarZonas();
  return ordenarZonas(await ZonaEntrega.find());
};

/** Las reglas activas, tal cual, para que la web arme el prompt. */
export const reglasPublicas = async (): Promise<
  { departamento: string; municipio: string; barrio: string; activo: boolean }[]
> => {
  await asegurarZonas();
  const zonas = await ZonaEntrega.find().select("departamento municipio barrio activo");
  return ordenarZonas(zonas).map((zona) => ({
    departamento: zona.departamento,
    municipio: zona.municipio,
    barrio: zona.barrio,
    activo: zona.activo,
  }));
};

/**
 * Agrega un municipio o un barrio a la cobertura (solo admin).
 *
 * `upsert` y no `insert`: si el lugar ya estaba —porque el dueño lo agregó
 * antes y lo desactivó—, volver a agregarlo lo reactiva en vez de fallar con
 * un error de índice duplicado que no explica nada.
 */
export const crearZona = async (datos: {
  departamento: string;
  municipio?: string;
  barrio?: string;
  activo?: boolean;
  nota?: string;
}): Promise<IZonaEntrega> => {
  const departamento = datos.departamento.trim();
  const municipio = (datos.municipio ?? "").trim();
  const barrio = (datos.barrio ?? "").trim();

  if (!DEPARTAMENTOS_COLOMBIA.includes(departamento as Departamento)) {
    throw createAppError("El departamento no es válido", 400);
  }
  // Un barrio sin municipio no se puede ubicar en ningún sitio, y dejaría una
  // regla que el asesor no puede aplicar (¿barrio de qué ciudad?).
  if (barrio && !municipio) {
    throw createAppError("Para agregar un barrio hay que indicar el municipio", 400);
  }

  const zona = await ZonaEntrega.findOneAndUpdate(
    { departamento, municipio, barrio },
    {
      $set: { activo: datos.activo ?? true, ...(datos.nota !== undefined ? { nota: datos.nota } : {}) },
      $setOnInsert: { departamento, municipio, barrio },
    },
    { upsert: true, new: true }
  );

  return zona as IZonaEntrega;
};

/**
 * Cambia el estado de una regla. Solo `activo` y `nota`: el lugar es la clave
 * de la fila, y renombrarlo dejaría huérfana la configuración y al asesor
 * buscando un barrio que ya no existe con ese nombre.
 */
export const actualizarZona = async (
  id: string,
  cambios: { activo?: boolean; nota?: string }
): Promise<IZonaEntrega> => {
  const zona = await ZonaEntrega.findById(id);
  if (!zona) throw createAppError("Zona de entrega no encontrada", 404);

  if (cambios.activo !== undefined) zona.activo = cambios.activo;
  if (cambios.nota !== undefined) zona.nota = cambios.nota.trim() || undefined;

  await zona.save();
  return zona;
};

/**
 * Borra un municipio o un barrio agregado a mano (solo admin).
 *
 * Las filas de departamento NO se borran: el sembrado las vuelve a crear en la
 * siguiente consulta, así que borrarlas sería un botón que no hace nada. Para
 * dejar de entregar en un departamento se desactiva.
 */
export const eliminarZona = async (id: string): Promise<void> => {
  const zona = await ZonaEntrega.findById(id);
  if (!zona) throw createAppError("Zona de entrega no encontrada", 404);

  if (!zona.municipio) {
    throw createAppError(
      "Los departamentos no se eliminan: desactívalos para dejar de entregar allí",
      400
    );
  }

  await zona.deleteOne();
};

export interface Cobertura {
  /** Lo que escribió el cliente, tal cual. */
  consulta: string;
  /** Si se pudo identificar un lugar. `false` ⇒ hay que preguntar otra vez. */
  reconocido: boolean;
  departamento?: string;
  municipio?: string;
  barrio?: string;
  /** Qué regla decidió la respuesta: la del barrio, la del municipio o la del departamento. */
  regla?: "barrio" | "municipio" | "departamento";
  /** `null` cuando no se reconoció la ubicación: no es un "no". */
  cubre: boolean | null;
}

/**
 * Responde "¿llegamos hasta allá?" a partir del texto libre del cliente.
 *
 * La regla aplicable es la más específica que exista: si el cliente nombró un
 * barrio y el dueño tiene una fila para ese barrio, decide esa fila; si no, la
 * del municipio; y si tampoco, la del departamento.
 *
 * Cuando no reconoce la ubicación devuelve `cubre: null` y no `false`: decir
 * "no cubrimos" por no entender "vivo en el oriente antioqueño" sería una
 * respuesta inventada, y el asesor la usaría para rechazar a un cliente real.
 */
export const consultarCobertura = async (ubicacion: string): Promise<Cobertura> => {
  await asegurarZonas();
  const zonas = await ZonaEntrega.find();

  const lugar = reconocerUbicacion(ubicacion, zonas);
  if (!lugar) return { consulta: ubicacion, reconocido: false, cubre: null };

  const base = {
    consulta: ubicacion,
    reconocido: true,
    departamento: lugar.departamento,
    municipio: lugar.municipio || undefined,
    barrio: lugar.barrio || undefined,
  };

  // Del más específico al más general; la primera fila que exista decide.
  const reglas: { filtro: Record<string, string>; nombre: Cobertura["regla"] }[] = [];
  if (lugar.barrio || lugar.municipio) {
    reglas.push({
      filtro: { departamento: lugar.departamento, municipio: lugar.municipio, barrio: lugar.barrio },
      nombre: lugar.barrio ? "barrio" : "municipio",
    });
  }
  if (lugar.municipio) {
    reglas.push({
      filtro: { departamento: lugar.departamento, municipio: lugar.municipio, barrio: "" },
      nombre: "municipio",
    });
  }
  reglas.push({
    filtro: { departamento: lugar.departamento, municipio: "", barrio: "" },
    nombre: "departamento",
  });

  for (const { filtro, nombre } of reglas) {
    const zona = zonas.find(
      (z) =>
        z.departamento === filtro.departamento &&
        z.municipio === filtro.municipio &&
        z.barrio === filtro.barrio
    );
    if (zona) return { ...base, regla: nombre, cubre: zona.activo };
  }

  // El departamento no está sembrado (no debería pasar: `asegurarZonas` corre
  // antes). No se inventa un "sí".
  return { ...base, cubre: false };
};
