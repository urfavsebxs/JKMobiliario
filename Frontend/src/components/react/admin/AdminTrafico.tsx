import { useCallback, useEffect, useState } from "react";
import { adminFetch, ErrorApi, mensajeError } from "./adminApi";

/** Ventanas del reporte, en el orden en que se muestran. */
const PERIODOS = [
  { clave: "diario", etiqueta: "Diario" },
  { clave: "semanal", etiqueta: "Semanal" },
  { clave: "mensual", etiqueta: "Mensual" },
] as const;

type ClavePeriodo = (typeof PERIODOS)[number]["clave"];

interface PuntoSerie {
  clave: string;
  vistas: number;
  visitantes: number;
}

interface ResumenTrafico {
  periodo: ClavePeriodo;
  desde: string;
  hasta: string;
  etiqueta: string;
  vistas: number;
  visitantes: number;
  serie: PuntoSerie[];
  /** En el reporte diario cada punto es una hora; en el resto, un día. */
  tramo: "hora" | "dia";
  paginas: Array<{ ruta: string; vistas: number; visitantes: number }>;
  origenes: Array<{ origen: string; vistas: number }>;
  dispositivos: Array<{ dispositivo: string; vistas: number }>;
}

const ETIQUETA_DISPOSITIVO: Record<string, string> = {
  movil: "Celular",
  tableta: "Tableta",
  escritorio: "Computador",
  desconocido: "Sin identificar",
};

/**
 * Etiqueta corta de un punto de la serie.
 * Para las horas, "14 h"; para los días, "lun 5". La fecha se arma a mediodía
 * (no a medianoche) para que el cambio de zona horaria del navegador no la
 * corra un día atrás.
 */
const etiquetaPunto = (punto: PuntoSerie, tramo: "hora" | "dia"): string => {
  if (tramo === "hora") return `${Number(punto.clave)} h`;
  const fecha = new Date(`${punto.clave}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return punto.clave;
  return fecha.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
};

/** Rango del reporte, ya legible: "Hoy, 9 de octubre" o "30 sep – 9 oct". */
const etiquetaRango = (resumen: ResumenTrafico): string => {
  const formato = (dia: string) =>
    new Date(`${dia}T12:00:00`).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
    });
  if (resumen.desde === resumen.hasta) return `Hoy, ${formato(resumen.hasta)}`;
  return `${formato(resumen.desde)} – ${formato(resumen.hasta)}`;
};

/** Una ruta larga (una ficha de producto) se recorta por el medio. */
const rutaCorta = (ruta: string, maximo = 46): string => {
  if (ruta.length <= maximo) return ruta;
  const mitad = Math.floor((maximo - 1) / 2);
  return `${ruta.slice(0, mitad)}…${ruta.slice(-mitad)}`;
};

/** Cada cuántos puntos se dibuja una etiqueta en el eje horizontal. */
const pasoDeEtiquetas = (total: number): number => (total <= 8 ? 1 : Math.ceil(total / 8));

/**
 * Reporte de tráfico de la página: cuánta gente entra, cuándo y a ver qué.
 *
 * Se alimenta de `/api/trafico/visita`, que el propio sitio manda en cada
 * página vista (ver el script del final de `Layout.astro`). El registro empezó
 * el 2026-10-09: **antes de esa fecha no hay datos y no se pueden inventar**,
 * por eso el estado vacío lo dice en vez de mostrar ceros disfrazados.
 *
 * Solo entra el admin (el tráfico de la tienda es información del dueño).
 */
export default function AdminTrafico() {
  const [periodo, setPeriodo] = useState<ClavePeriodo>("diario");
  const [resumen, setResumen] = useState<ResumenTrafico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (cual: ClavePeriodo) => {
    setCargando(true);
    setError(null);
    try {
      const datos = await adminFetch<ResumenTrafico>(`/api/trafico/resumen?periodo=${cual}`);
      setResumen(datos);
    } catch (e) {
      // El 401 ya redirige a /login dentro de adminFetch.
      if (e instanceof ErrorApi && e.estado === 401) return;
      setError(mensajeError(e, "No se pudo cargar el reporte de tráfico"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(periodo);
  }, [periodo, cargar]);

  const maximo = resumen ? Math.max(...resumen.serie.map((p) => p.vistas), 1) : 1;
  const vistasPorPersona =
    resumen && resumen.visitantes > 0 ? (resumen.vistas / resumen.visitantes).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((opcion) => {
          const activo = opcion.clave === periodo;
          return (
            <button
              key={opcion.clave}
              type="button"
              onClick={() => setPeriodo(opcion.clave)}
              aria-pressed={activo}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activo
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
        {resumen && (
          <span className="ml-auto text-sm text-gray-500">
            {resumen.etiqueta} · {etiquetaRango(resumen)}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando && !resumen && <p className="text-sm text-gray-500">Cargando el reporte…</p>}

      {resumen && (
        <>
          {/* Cifras de cabecera. "Visitas" es lo que se cuenta (cada página
              abierta); "Personas" son visitantes distintos: quien entra diez
              veces al día es una persona y diez visitas. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Visitas</p>
              <p className="mt-1 text-4xl font-semibold text-gray-900">
                {resumen.vistas.toLocaleString("es-CO")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Personas</p>
              <p className="mt-1 text-4xl font-semibold text-gray-900">
                {resumen.visitantes.toLocaleString("es-CO")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Páginas por persona</p>
              <p className="mt-1 text-4xl font-semibold text-gray-900">{vistasPorPersona}</p>
            </div>
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">
              {resumen.tramo === "hora" ? "Visitas por hora" : "Visitas por día"}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {resumen.tramo === "hora"
                ? "Cada barra es una hora del día de hoy, hora de Colombia."
                : `Cada barra es un día, del ${etiquetaRango(resumen)}.`}
            </p>

            {resumen.vistas === 0 ? (
              <p className="mt-4 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Todavía no hay visitas registradas en este periodo. El registro empezó el 9 de
                octubre de 2026: lo anterior a esa fecha no se puede recuperar.
              </p>
            ) : (
              <div className="mt-5">
                <div className="flex h-40 items-end gap-[2px] border-b border-gray-300">
                  {resumen.serie.map((punto, indice) => {
                    const alto = punto.vistas === 0 ? 0 : Math.max(2, (punto.vistas / maximo) * 100);
                    const esPico = punto.vistas === maximo && punto.vistas > 0;
                    const mostrarEtiqueta = indice % pasoDeEtiquetas(resumen.serie.length) === 0;
                    return (
                      <div key={punto.clave} className="group relative flex h-full flex-1 flex-col justify-end">
                        {esPico && (
                          <span className="mb-1 text-center text-xs font-medium text-gray-700">
                            {punto.vistas}
                          </span>
                        )}
                        <div
                          role="img"
                          aria-label={`${etiquetaPunto(punto, resumen.tramo)}: ${punto.vistas} visitas de ${punto.visitantes} personas`}
                          className={`w-full rounded-t-[4px] ${
                            punto.vistas === 0 ? "bg-gray-200" : "bg-jk-gold-deep group-hover:bg-gray-900"
                          }`}
                          style={{ height: punto.vistas === 0 ? "2px" : `${alto}%` }}
                        />
                        {/* El detalle al pasar el mouse. Se dibuja por CSS (group-hover),
                            sin seguir el puntero: en una barra tan delgada, el dato
                            importa más que el adorno. */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white group-hover:block">
                          <strong className="font-semibold">{etiquetaPunto(punto, resumen.tramo)}</strong>
                          {" · "}
                          {punto.vistas} {punto.vistas === 1 ? "visita" : "visitas"} ·{" "}
                          {punto.visitantes} {punto.visitantes === 1 ? "persona" : "personas"}
                        </div>
                        {mostrarEtiqueta && (
                          <span className="mt-1 text-center text-[10px] text-gray-500">
                            {etiquetaPunto(punto, resumen.tramo)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  La barra gris es una hora o un día sin visitas (no falta el dato: no hubo nadie).
                </p>
              </div>
            )}

            {/* Vista de tabla: el gráfico no es la única forma de leer el dato. */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                Ver los datos en tabla
              </summary>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2">{resumen.tramo === "hora" ? "Hora" : "Día"}</th>
                    <th className="py-2 text-right">Visitas</th>
                    <th className="py-2 text-right">Personas</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.serie.map((punto) => (
                    <tr key={punto.clave} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">{etiquetaPunto(punto, resumen.tramo)}</td>
                      <td className="py-1.5 text-right text-gray-700">{punto.vistas}</td>
                      <td className="py-1.5 text-right text-gray-700">{punto.visitantes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">Páginas más vistas</h2>
              {resumen.paginas.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Sin visitas en este periodo.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {resumen.paginas.slice(0, 10).map((pagina) => (
                    <li key={pagina.ruta} className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-mono text-xs text-gray-700" title={pagina.ruta}>
                        {rutaCorta(pagina.ruta)}
                      </span>
                      <span className="whitespace-nowrap text-sm text-gray-500">
                        {pagina.vistas} {pagina.vistas === 1 ? "visita" : "visitas"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">De dónde llegan</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                «Directo» es quien entró escribiendo la dirección o desde una página del propio
                sitio.
              </p>
              {resumen.origenes.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Sin visitas en este periodo.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {resumen.origenes.slice(0, 10).map((origen) => (
                    <li key={origen.origen} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-gray-700" title={origen.origen}>
                        {origen.origen === "(directo)" ? "Directo" : origen.origen}
                      </span>
                      <span className="whitespace-nowrap text-sm text-gray-500">
                        {origen.vistas} {origen.vistas === 1 ? "visita" : "visitas"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">Desde qué aparato</h2>
              {resumen.dispositivos.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Sin visitas en este periodo.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {resumen.dispositivos.map((fila) => (
                    <li key={fila.dispositivo} className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-gray-700">
                        {ETIQUETA_DISPOSITIVO[fila.dispositivo] ?? fila.dispositivo}
                      </span>
                      <span className="whitespace-nowrap text-sm text-gray-500">
                        {fila.vistas} {fila.vistas === 1 ? "visita" : "visitas"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                El sistema no guarda direcciones IP, ni nombres, ni datos de contacto: solo cuenta
                visitas. Por eso no hay aviso de cookies en la página.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
