import crypto from "crypto";
import type { PipelineStage } from "mongoose";
import { Visita, Dispositivo, DISPOSITIVOS, Periodo } from "../../models/Visita";
import { config } from "../../config";
import { AppError } from "../../middlewares/errorHandler";

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

/**
 * Los reportes se cortan por día colombiano, no por el día del servidor.
 *
 * El servidor corre en UTC. A las 7 de la tarde en Medellín ya es el día
 * siguiente en UTC, así que agrupar por la fecha del proceso partiría la tarde
 * —que es cuando más visita la gente— entre dos días y el reporte diario
 * mostraría un pico falso a medianoche.
 */
const ZONA = "America/Bogota";

const formateadorDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formateadorHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  hour: "2-digit",
  hour12: false,
});

/** Día colombiano de un instante, como `YYYY-MM-DD` (en-CA ya da ese orden). */
export const diaEnColombia = (fecha: Date): string => formateadorDia.format(fecha);

/** Hora colombiana de un instante (0-23). */
const horaEnColombia = (fecha: Date): number => Number(formateadorHora.format(fecha));

/** Los `dias` días que terminan hoy, del más viejo al más reciente. */
const ultimosDias = (dias: number): string[] => {
  const hoy = Date.now();
  const lista: string[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    lista.push(diaEnColombia(new Date(hoy - i * 24 * 60 * 60 * 1000)));
  }
  return lista;
};

/**
 * Sal del hash de visitante. Cambia cada día, así que el hash de una persona no
 * se puede seguir de un día para otro: es lo que hace innecesario el banner de
 * cookies. Se deriva del secreto del JWT (con separador propio) para no añadir
 * una variable de entorno más que haya que acordarse de configurar.
 */
const salDelDia = (dia: string): string =>
  crypto.createHash("sha256").update(`jk-trafico-v1|${config.jwtSecret}|${dia}`).digest("hex");

/**
 * Identificador del visitante para ESE día: hash de IP + User-Agent + sal
 * diaria. Ni la IP ni el User-Agent se guardan; al día siguiente el mismo
 * visitante produce otro hash.
 */
const hashVisitante = (ip: string, userAgent: string, dia: string): string =>
  crypto.createHash("sha256").update(`${ip}|${userAgent}|${salDelDia(dia)}`).digest("hex").slice(0, 32);

/** Dispositivo según el User-Agent. Sin UA legible, `desconocido` (no se adivina). */
export const dispositivoDe = (userAgent: string): Dispositivo => {
  const ua = userAgent.toLowerCase();
  if (!ua) return "desconocido";
  // Las tabletas primero: el UA del iPad trae "Mobile" y si se mirara antes
  // caería como móvil; el de Android tableta no trae "Mobile" y caería como
  // escritorio.
  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
    return "tableta";
  }
  if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return "movil";
  if (/windows|macintosh|linux|cros/.test(ua)) return "escritorio";
  return "desconocido";
};

/** Dominios propios: una navegación interna no es un origen externo. */
const HOSTS_PROPIOS = [
  "jkmobiliario.digital",
  "web.jkmobiliario.digital",
  "api.jkmobiliario.digital",
  "localhost",
];

/**
 * Host del origen de la visita, ya limpio.
 *
 * Se guarda solo el host (nunca la URL completa): la URL de origen puede
 * traer parámetros de campaña y, cuando alguien comparte un enlace, hasta
 * datos de quien lo compartió. Y si el origen es el propio sitio, la visita
 * cuenta como directa: un clic de una página interna a otra no es "venir de
 * otro lado".
 */
export const origenDe = (referidor?: string | null): string => {
  if (!referidor) return "(directo)";
  let host: string;
  try {
    host = new URL(referidor).hostname.toLowerCase();
  } catch {
    // Un `Referer` que no es URL (o el centinela "null"): no se inventa origen.
    return "(directo)";
  }
  host = host.replace(/^www\./, "");
  if (!host) return "(directo)";
  if (HOSTS_PROPIOS.some((propio) => host === propio || host.endsWith(`.${propio}`))) {
    return "(directo)";
  }
  return host.slice(0, 120);
};

interface RegistrarVisitaDTO {
  ruta: string;
  /** `document.referrer` tal cual. */
  referidor?: string | null;
  userAgent?: string;
  /** IP ya resuelta por Express (con `trust proxy`, la del visitante real). */
  ip?: string;
}

/**
 * Guarda una vista de página. Es la única escritura del módulo y la llama el
 * navegador del visitante, sin sesión.
 *
 * Nunca lanza por datos raros: una visita que no se puede registrar no es un
 * error que el visitante deba ver. Solo se rechaza lo que no tiene sentido
 * guardar (una ruta que no es del sitio).
 */
export const registrarVisita = async (datos: RegistrarVisitaDTO): Promise<void> => {
  const ruta = datos.ruta.trim();
  if (!ruta.startsWith("/")) {
    throw createAppError("La ruta debe empezar por /", 400);
  }

  const ahora = new Date();
  const dia = diaEnColombia(ahora);

  await Visita.create({
    fecha: dia,
    hora: horaEnColombia(ahora),
    ruta: ruta.slice(0, 300),
    referidor: origenDe(datos.referidor),
    dispositivo: dispositivoDe(datos.userAgent ?? ""),
    visitante: hashVisitante(datos.ip ?? "sin-ip", datos.userAgent ?? "", dia),
    ts: ahora,
  });
};

/** Días que abarca cada periodo (el diario es un solo día). */
const DIAS_POR_PERIODO: Record<Periodo, number> = {
  diario: 1,
  semanal: 7,
  mensual: 30,
};

export interface PuntoSerie {
  /** `09` (hora) en el reporte diario, `2026-10-05` en el semanal y el mensual. */
  clave: string;
  vistas: number;
  visitantes: number;
}

export interface ResumenTrafico {
  periodo: Periodo;
  desde: string;
  hasta: string;
  /** Etiqueta ya legible del rango ("Hoy", "Últimos 7 días", "Últimos 30 días"). */
  etiqueta: string;
  vistas: number;
  /** Personas distintas del rango (hash del día, ver el modelo). */
  visitantes: number;
  /** Serie completa: los tramos sin visitas van en cero, no se omiten. */
  serie: PuntoSerie[];
  /** Vista por tramo: en el diario, la hora; en el resto, el día. */
  tramo: "hora" | "dia";
  paginas: Array<{ ruta: string; vistas: number; visitantes: number }>;
  origenes: Array<{ origen: string; vistas: number }>;
  dispositivos: Array<{ dispositivo: Dispositivo; vistas: number }>;
};

/**
 * Cuenta vistas y visitantes distintos de un conjunto agrupado por una clave.
 * `$addToSet` + `$size` es la forma barata de contar únicos: una persona que
 * entra cinco veces al mismo tramo suma una sola vez.
 */
const agrupar = async (
  match: Record<string, unknown>,
  campo: string,
  ordenar = false
): Promise<Array<{ _id: string; vistas: number; visitantes: number }>> => {
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $group: { _id: `$${campo}`, vistas: { $sum: 1 }, visitantes: { $addToSet: "$visitante" } } },
    { $project: { _id: 1, vistas: 1, visitantes: { $size: "$visitantes" } } },
  ];
  if (ordenar) pipeline.push({ $sort: { vistas: -1 } });
  return Visita.aggregate(pipeline);
};

/**
 * Reporte de tráfico de un periodo, para el panel.
 *
 * Devuelve la serie completa (con los tramos vacíos en cero) para que el
 * gráfico no mienta: si un día no hubo visitas, tiene que verse el hueco, no
 * desaparecer del eje.
 */
export const resumenTrafico = async (periodo: Periodo): Promise<ResumenTrafico> => {
  const dias = ultimosDias(DIAS_POR_PERIODO[periodo]);
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const tramo: "hora" | "dia" = periodo === "diario" ? "hora" : "dia";

  const match = { fecha: { $gte: desde, $lte: hasta } };

  const [totales, porP, porO, porD, serieCruda] = await Promise.all([
    // Totales del rango: los visitantes únicos son de todo el rango, no la suma
    // de los tramos (quien volvió el martes y el jueves es una persona).
    Visita.aggregate<{ vistas: number; visitantes: string[] }>([
      { $match: match },
      { $group: { _id: null, vistas: { $sum: 1 }, visitantes: { $addToSet: "$visitante" } } },
    ]),
    // El tope de 150 filas no es decorativo: una ruta con id de producto
    // (/products/68f...) es una fila por producto y sin tope la lista no cabe.
    Visita.aggregate<{ _id: string; vistas: number; visitantes: string[] }>([
      { $match: match },
      { $group: { _id: "$ruta", vistas: { $sum: 1 }, visitantes: { $addToSet: "$visitante" } } },
      { $sort: { vistas: -1 } },
      { $limit: 150 },
    ]),
    agrupar(match, "referidor", true),
    agrupar(match, "dispositivo"),
    periodo === "diario"
      ? Visita.aggregate<{ _id: number; vistas: number; visitantes: number }>([
          { $match: match },
          { $group: { _id: "$hora", vistas: { $sum: 1 }, visitantes: { $addToSet: "$visitante" } } },
          { $project: { _id: 1, vistas: 1, visitantes: { $size: "$visitantes" } } },
        ])
      : agrupar(match, "fecha"),
  ]);

  // La hora vuelve como número ("9") y el día como cadena ("2026-10-05"): la
  // clave se normaliza a cadena para poder buscar los tramos vacíos por igual.
  const aClave = (valor: string | number): string =>
    periodo === "diario" ? String(valor).padStart(2, "0") : String(valor);

  const conteoPorClave = new Map<string, PuntoSerie>(
    serieCruda.map((fila) => [
      aClave(fila._id),
      { clave: aClave(fila._id), vistas: fila.vistas, visitantes: fila.visitantes },
    ])
  );

  // Relleno de los tramos sin visitas.
  const claves = periodo === "diario" ? Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")) : dias;
  const serie: PuntoSerie[] = claves.map(
    (clave) => conteoPorClave.get(clave) ?? { clave, vistas: 0, visitantes: 0 }
  );

  const visitaCruda = totales[0];

  return {
    periodo,
    desde,
    hasta,
    etiqueta: periodo === "diario" ? "Hoy" : periodo === "semanal" ? "Últimos 7 días" : "Últimos 30 días",
    vistas: visitaCruda?.vistas ?? 0,
    visitantes: visitaCruda?.visitantes?.length ?? 0,
    serie,
    tramo,
    paginas: porP.map((fila) => ({
      ruta: fila._id,
      vistas: fila.vistas,
      visitantes: fila.visitantes.length,
    })),
    // Los orígenes van completos (sin tope): son hosts y suelen ser pocos.
    origenes: porO.map((fila) => ({ origen: fila._id, vistas: fila.vistas })),
    dispositivos: DISPOSITIVOS.map((dispositivo) => ({
      dispositivo,
      vistas: porD.find((fila) => fila._id === dispositivo)?.vistas ?? 0,
    })).filter((fila) => fila.vistas > 0),
  };
};
