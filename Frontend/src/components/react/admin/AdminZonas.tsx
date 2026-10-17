import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch, mensajeError } from "./adminApi";

/**
 * Administración de las zonas de entrega.
 *
 * El asesor de WhatsApp le pregunta la ciudad y el barrio al cliente y consulta
 * estas mismas reglas antes de seguir con la venta, así que lo que se marque
 * aquí cambia lo que el bot responde en la calle. Por eso cada cambio se guarda
 * al instante (no hay botón de "Guardar"): una pantalla con cambios sin
 * confirmar que se cierra sola dejaría al asesor diciendo algo distinto de lo
 * que el dueño cree.
 *
 * **La regla más específica gana.** Los 33 departamentos vienen activos —
 * la empresa ya repartía a nivel nacional antes de que existiera esta pantalla—
 * y encima se agregan municipios y barrios. Para dejar de ir a un barrio no hay
 * que apagar la ciudad entera: se agrega el barrio y se apaga.
 */

interface Zona {
  id: string;
  departamento: string;
  municipio: string;
  barrio: string;
  activo: boolean;
  nota: string;
}

type Guardando = "activo" | "nota" | null;

/** 1 = departamento, 2 = municipio, 3 = barrio. Solo cambia la indentación. */
const nivelDe = (zona: Zona): number => (zona.barrio ? 3 : zona.municipio ? 2 : 1);

const etiquetaDe = (zona: Zona): string =>
  zona.barrio ? "Barrio" : zona.municipio ? "Todo el municipio" : "Todo el departamento";

const nombreDe = (zona: Zona): string => zona.barrio || zona.municipio || zona.departamento;

export default function AdminZonas() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState("");
  const [guardando, setGuardando] = useState<Record<string, Guardando>>({});
  const [guardandoTodo, setGuardandoTodo] = useState(false);

  // Formulario de alta.
  const [nuevoDepartamento, setNuevoDepartamento] = useState("");
  const [nuevoMunicipio, setNuevoMunicipio] = useState("");
  const [nuevoBarrio, setNuevoBarrio] = useState("");
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    let vigente = true;

    (async () => {
      try {
        const datos = await adminFetch<Zona[]>("/api/zonas");
        if (vigente) setZonas(datos);
      } catch (fallo) {
        if (vigente) setError(mensajeError(fallo, "No se pudieron cargar las zonas de entrega"));
      } finally {
        if (vigente) setCargando(false);
      }
    })();

    return () => {
      vigente = false;
    };
  }, []);

  /** Los departamentos, en el orden en que llegan (el oficial), para el <select>. */
  const departamentos = useMemo(
    () => zonas.filter((zona) => !zona.municipio).map((zona) => zona.departamento),
    [zonas]
  );

  /** Vista previa de lo que se va a agregar: "Antioquia › Medellín › Belén". */
  const rutaNueva = [nuevoDepartamento, nuevoMunicipio.trim(), nuevoBarrio.trim()]
    .filter(Boolean)
    .join(" › ");

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    if (!texto) return zonas;

    // Un departamento que coincide arrastra a sus municipios y barrios: buscar
    // "Antioquia" y ver solo la fila del departamento no dejaría revisar lo que
    // el dueño tiene configurado dentro.
    const departamentosQueCoinciden = new Set(
      zonas
        .filter((zona) => !zona.municipio && zona.departamento.toLowerCase().includes(texto))
        .map((zona) => zona.departamento)
    );

    return zonas.filter(
      (zona) =>
        zona.departamento.toLowerCase().includes(texto) ||
        zona.municipio.toLowerCase().includes(texto) ||
        zona.barrio.toLowerCase().includes(texto) ||
        departamentosQueCoinciden.has(zona.departamento)
    );
  }, [zonas, filtro]);

  const activas = useMemo(() => zonas.filter((zona) => zona.activo).length, [zonas]);
  const conEntrega = useMemo(
    () => zonas.filter((zona) => zona.activo && !zona.municipio).length,
    [zonas]
  );

  const marcar = useCallback((id: string, valor: Guardando) => {
    setGuardando((previos) => ({ ...previos, [id]: valor }));
  }, []);

  /**
   * Guarda un cambio. Se pinta antes de que conteste el servidor (la casilla no
   * puede quedarse colgada esperando a la red) y se revierte si falla: dejar la
   * casilla cambiada tras un error haría creer al dueño que guardó algo que no.
   */
  const guardar = useCallback(
    async (zona: Zona, cambios: Partial<Pick<Zona, "activo" | "nota">>, campo: Guardando) => {
      const previo = { activo: zona.activo, nota: zona.nota };
      setZonas((actuales) =>
        actuales.map((actual) => (actual.id === zona.id ? { ...actual, ...cambios } : actual))
      );
      marcar(zona.id, campo);
      setAviso("");

      try {
        await adminFetch<Zona>(`/api/zonas/${zona.id}`, {
          method: "PATCH",
          body: JSON.stringify(cambios),
        });
      } catch (fallo) {
        setZonas((actuales) =>
          actuales.map((actual) => (actual.id === zona.id ? { ...actual, ...previo } : actual))
        );
        setAviso(mensajeError(fallo, "No se pudo guardar el cambio"));
      } finally {
        marcar(zona.id, null);
      }
    },
    [marcar]
  );

  const agregar = useCallback(async () => {
    const municipio = nuevoMunicipio.trim();
    const barrio = nuevoBarrio.trim();
    if (!nuevoDepartamento || (!municipio && !barrio)) {
      setAviso("Elige el departamento e indica al menos un municipio o un barrio.");
      return;
    }
    if (barrio && !municipio) {
      setAviso("Para agregar un barrio hay que indicar también el municipio.");
      return;
    }

    setAgregando(true);
    setAviso("");
    try {
      const creada = await adminFetch<Zona>("/api/zonas", {
        method: "POST",
        body: JSON.stringify({ departamento: nuevoDepartamento, municipio, barrio }),
      });
      setZonas((actuales) =>
        actuales.some((zona) => zona.id === creada.id)
          ? actuales.map((zona) => (zona.id === creada.id ? creada : zona))
          : [...actuales, creada]
      );
      setNuevoMunicipio("");
      setNuevoBarrio("");
      setAviso(`Se agregó ${[creada.departamento, creada.municipio, creada.barrio].filter(Boolean).join(" › ")}.`);
    } catch (fallo) {
      setAviso(mensajeError(fallo, "No se pudo agregar el lugar"));
    } finally {
      setAgregando(false);
    }
  }, [nuevoDepartamento, nuevoMunicipio, nuevoBarrio]);

  const eliminar = useCallback(async (zona: Zona) => {
    const ruta = [zona.departamento, zona.municipio, zona.barrio].filter(Boolean).join(" › ");
    if (!confirm(`¿Quitar "${ruta}" de las zonas de entrega?`)) return;

    setAviso("");
    try {
      await adminFetch(`/api/zonas/${zona.id}`, { method: "DELETE" });
      setZonas((actuales) => actuales.filter((actual) => actual.id !== zona.id));
    } catch (fallo) {
      setAviso(mensajeError(fallo, "No se pudo quitar el lugar"));
    }
  }, []);

  const activarDepartamentos = useCallback(async () => {
    setGuardandoTodo(true);
    setAviso("");
    try {
      const pendientes = zonas.filter((zona) => !zona.municipio && !zona.activo);
      const resultados = await Promise.allSettled(
        pendientes.map((zona) =>
          adminFetch<Zona>(`/api/zonas/${zona.id}`, {
            method: "PATCH",
            body: JSON.stringify({ activo: true }),
          })
        )
      );
      const fallidas = resultados.filter((resultado) => resultado.status === "rejected").length;

      setZonas((actuales) =>
        actuales.map((zona) =>
          zona.municipio || zona.activo ? zona : { ...zona, activo: true }
        )
      );
      // Un fallo parcial se dice tal cual: si no se avisa, el dueño cree que
      // todo el país quedó activo y el asesor sigue rechazando clientes.
      if (fallidas > 0) setAviso(`No se pudieron activar ${fallidas} departamentos. Vuelve a intentarlo.`);
      else if (pendientes.length > 0) setAviso(`Se activaron ${pendientes.length} departamentos.`);
    } finally {
      setGuardandoTodo(false);
    }
  }, [zonas]);

  if (cargando) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        Cargando zonas de entrega…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">
              El asesor confirma la entrega con estas reglas.{" "}
              <strong className="text-gray-900">
                {conEntrega} de {departamentos.length}
              </strong>{" "}
              departamentos con entrega activa
              {zonas.length > departamentos.length && (
                <> y {zonas.length - departamentos.length} reglas de municipio o barrio.</>
              )}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Los departamentos vienen activos. Para no ir a un barrio concreto, agrégalo y
              desactívalo: <strong>manda siempre la regla más específica</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void activarDepartamentos()}
            disabled={guardandoTodo || conEntrega === departamentos.length}
            className="bg-white border border-gray-300 text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardandoTodo ? "Activando…" : "Activar todos los departamentos"}
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-medium text-gray-900">Agregar un municipio o un barrio</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Departamento</span>
              <select
                value={nuevoDepartamento}
                onChange={(evento) => setNuevoDepartamento(evento.target.value)}
                className="min-w-[190px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              >
                <option value="">Elige…</option>
                {departamentos.map((departamento) => (
                  <option key={departamento} value={departamento}>
                    {departamento}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Municipio o ciudad</span>
              <input
                type="text"
                value={nuevoMunicipio}
                onChange={(evento) => setNuevoMunicipio(evento.target.value)}
                maxLength={120}
                placeholder="Medellín"
                className="min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Barrio (opcional)</span>
              <input
                type="text"
                value={nuevoBarrio}
                onChange={(evento) => setNuevoBarrio(evento.target.value)}
                maxLength={120}
                placeholder="Belén"
                className="min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void agregar()}
              disabled={agregando}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {agregando ? "Agregando…" : "Agregar"}
            </button>
          </div>
          {rutaNueva && (
            <p className="mt-2 text-xs text-gray-500">
              Se agregará <strong className="text-gray-900">{rutaNueva}</strong> como zona con
              entrega activa.
            </p>
          )}
        </div>

        {aviso && (
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            {aviso}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-3">
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Buscar</span>
            <input
              type="search"
              value={filtro}
              onChange={(evento) => setFiltro(evento.target.value)}
              placeholder="Departamento, municipio o barrio"
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
            />
            <span className="text-sm text-gray-500">
              {visibles.length} de {zonas.length}
            </span>
          </label>
        </div>

        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lugar
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entrega
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nota interna
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {visibles.map((zona, indice) => {
              const anterior = visibles[indice - 1];
              const cambiaDepartamento = !anterior || anterior.departamento !== zona.departamento;
              const nivel = nivelDe(zona);

              return (
                <tr
                  key={zona.id}
                  className={`hover:bg-gray-50 ${
                    cambiaDepartamento && indice > 0 ? "border-t-2 border-gray-200" : ""
                  }`}
                >
                  <td className="px-6 py-3">
                    <div
                      style={{ paddingLeft: `${(nivel - 1) * 20}px` }}
                      className="flex flex-wrap items-center gap-2"
                    >
                      {nivel > 1 && (
                        <span aria-hidden="true" className="text-gray-300">
                          ↳
                        </span>
                      )}
                      <span
                        className={`text-sm ${
                          nivel === 1 ? "font-semibold text-gray-900" : "text-gray-700"
                        }`}
                      >
                        {nombreDe(zona)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        {etiquetaDe(zona)}
                      </span>
                      {nivel > 1 && (
                        <span className="text-[11px] text-gray-400">{zona.departamento}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={zona.activo}
                        disabled={guardando[zona.id] === "activo"}
                        onChange={(evento) =>
                          void guardar(zona, { activo: evento.target.checked }, "activo")
                        }
                        className="h-5 w-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          zona.activo ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {zona.activo ? "Se entrega" : "Sin entrega"}
                      </span>
                    </label>
                  </td>
                  <td className="px-6 py-3">
                    <input
                      type="text"
                      defaultValue={zona.nota}
                      maxLength={300}
                      placeholder="Solo la ve el equipo (ej. «solo hasta las 5 p.m.»)"
                      disabled={guardando[zona.id] === "nota"}
                      onBlur={(evento) => {
                        const valor = evento.target.value.trim();
                        if (valor === zona.nota.trim()) return;
                        void guardar(zona, { nota: valor }, "nota");
                      }}
                      className="w-full min-w-[220px] rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
                    />
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    {nivel > 1 ? (
                      <button
                        type="button"
                        onClick={() => void eliminar(zona)}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Quitar
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                  Ningún lugar coincide con «{filtro}».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 px-1">
        Las notas son internas: no se le muestran al cliente ni las lee el asesor. Los
        departamentos no se pueden quitar (se desactivan); los municipios y barrios sí.
      </p>
    </div>
  );
}
