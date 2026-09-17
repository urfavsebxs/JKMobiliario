import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "@nanostores/react";
import { colorMueble, setColorMueble, type ColorMueble } from "../../lib/colorMueble";
import {
  fijarMedidas,
  medidasMueble,
  type MedidasBase,
  type MedidasMueble,
} from "../../lib/medidasMueble";
import type { ProductColor } from "../../lib/types";
import type { Escala3D } from "./visor3d/Escena3D";

// La escena (three.js + drei) se descarga como chunk aparte sólo cuando el
// visor entra en pantalla.
const Escena3D = lazy(() => import("./visor3d/Escena3D"));

/** Acabados de mobiliario disponibles en el visor. */
const ACABADOS: ColorMueble[] = [
  { nombre: "Blanco roto", hex: "#F2EFE9" },
  { nombre: "Arena", hex: "#D8C3A5" },
  { nombre: "Roble claro", hex: "#C89F6B" },
  { nombre: "Nogal", hex: "#8A5A3B" },
  { nombre: "Wengué", hex: "#3B2A22" },
  { nombre: "Gris perla", hex: "#B9B9B4" },
  { nombre: "Grafito", hex: "#4A4A4A" },
  { nombre: "Negro mate", hex: "#1E1E1E" },
  { nombre: "Verde oliva", hex: "#6B705C" },
  { nombre: "Azul petróleo", hex: "#34495E" },
  { nombre: "Terracota", hex: "#B06A4A" },
  { nombre: "Dorado palo", hex: "#C8BE98" },
];

const COLOR_ORIGINAL = "#FFFFFF";

// Límites generosos: evitan escalas degeneradas si alguien escribe un valor
// absurdo, sin recortar el uso normal.
const ESCALA_MIN = 0.15;
const ESCALA_MAX = 6;

const CAMPOS_MEDIDA: Array<{ clave: keyof MedidasMueble; etiqueta: string }> = [
  { clave: "ancho", etiqueta: "Ancho" },
  { clave: "profundo", etiqueta: "Largo" },
  { clave: "alto", etiqueta: "Alto" },
];

interface Visor3DProps {
  modelUrl: string;
  colores?: ProductColor[];
  nombre?: string;
  /** Medidas reales del modelo base, para calcular proporciones. */
  medidasBase?: MedidasBase;
}

class LimiteVisor extends Component<
  { children: ReactNode; fallback: ReactNode },
  { fallo: boolean }
> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  render() {
    return this.state.fallo ? this.props.fallback : this.props.children;
  }
}

function Esqueleto() {
  return (
    <div className="flex h-full w-full animate-pulse items-center justify-center bg-jk-mist/60">
      <p className="font-sans text-[13px] text-jk-gold-deep">Vista 3D interactiva</p>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="font-sans text-[13px] text-jk-gold-deep">Cargando visor 3D…</p>
    </div>
  );
}

function AvisoError() {
  return (
    <div className="flex h-full w-full items-center justify-center px-8 text-center">
      <p className="font-sans text-[13px] leading-relaxed text-jk-gold-deep">
        No pudimos cargar el visor 3D. Aun así puedes elegir el color y cotizar tu mueble por
        WhatsApp.
      </p>
    </div>
  );
}

export default function Visor3D({
  modelUrl,
  colores = [],
  nombre = "el mueble",
  medidasBase,
}: Visor3DProps) {
  const elegido = useStore(colorMueble);
  const medidas = useStore(medidasMueble);
  const color = elegido?.hex ?? COLOR_ORIGINAL;

  const contenedor = useRef<HTMLDivElement>(null);
  const [descargar, setDescargar] = useState(false);
  const [activo, setActivo] = useState(false);
  const [girar, setGirar] = useState(false);

  // Carga diferida real: el chunk de three.js y el GLB sólo se piden cuando el
  // visor se acerca al viewport. Cuando sale de pantalla se pausa el render.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    if (typeof IntersectionObserver === "undefined") {
      setDescargar(true);
      setActivo(true);
      return;
    }

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) setDescargar(true);
        setActivo(entrada.isIntersecting);
      },
      { rootMargin: "200px" }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // Escala por eje: cada medida objetivo se compara con la medida base del
  // modelo. Sin dato en alguno de los dos lados, ese eje no se deforma.
  const escala = useMemo<Escala3D>(() => {
    const calcular = (objetivo?: number, base?: number) => {
      if (!objetivo || !base || base <= 0) return 1;
      return Math.min(Math.max(objetivo / base, ESCALA_MIN), ESCALA_MAX);
    };

    return {
      x: calcular(medidas?.ancho, medidasBase?.ancho),
      y: calcular(medidas?.alto, medidasBase?.alto),
      z: calcular(medidas?.profundo, medidasBase?.largo),
    };
  }, [medidas, medidasBase]);

  // Color de catálogo + acabados, sin duplicados por hex.
  const opciones = useMemo(() => {
    const lista = [
      ...colores.map((c) => ({ nombre: c.name, hex: (c.hex || "").toUpperCase() })),
      ...ACABADOS,
    ];
    const vistos = new Set<string>();
    return lista.filter((c) => {
      if (!c.hex.startsWith("#") || vistos.has(c.hex)) return false;
      vistos.add(c.hex);
      return true;
    });
  }, [colores]);

  const resumen = medidas
    ? [
        medidas.ancho ? `${medidas.ancho} ancho` : null,
        medidas.profundo ? `${medidas.profundo} largo` : null,
        medidas.alto ? `${medidas.alto} alto` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : medidasBase
      ? `Base: ${medidasBase.ancho ?? "—"} × ${medidasBase.largo ?? "—"}${
          medidasBase.alto ? ` × ${medidasBase.alto}` : ""
        } cm`
      : null;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
      {/* Lienzo 3D */}
      <div
        role="img"
        aria-label={`Vista 3D interactiva de ${nombre}`}
        className="relative overflow-hidden rounded-[4px] border border-jk-gold bg-[#f3f1ea]"
      >
        <div ref={contenedor} className="aspect-[4/3] w-full lg:aspect-16/10">
          {descargar ? (
            <LimiteVisor fallback={<AvisoError />}>
              <Suspense fallback={<Cargando />}>
                <Escena3D url={modelUrl} color={color} escala={escala} girar={girar} activo={activo} />
              </Suspense>
            </LimiteVisor>
          ) : (
            <Esqueleto />
          )}
        </div>

        {resumen && (
          <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 font-sans text-[12px] text-jk-gold-deep backdrop-blur">
            {medidas ? `Tus medidas: ${resumen}` : resumen}
          </p>
        )}

        <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/40 to-transparent px-4 pt-8 pb-2 text-center font-sans text-[12px] text-white">
          Arrastra para girar · Rueda o pinza para acercar
        </p>
      </div>

      {/* Personalización */}
      <aside className="rounded-[4px] border border-jk-gold/60 bg-white p-5">
        <h3 className="font-sans text-[16px] font-semibold text-jk-ink">Personaliza tu mueble</h3>
        <p className="mt-1 font-sans text-[13px] leading-relaxed text-jk-gold-deep">
          Define las medidas y el acabado; el modelo se actualiza al instante.
        </p>

        {medidasBase && (
          <div className="mt-5 border-t border-jk-gold/40 pt-4">
            <h4 className="font-sans text-[13px] font-medium text-jk-ink">Medidas (cm)</h4>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {CAMPOS_MEDIDA.map(({ clave, etiqueta }) => (
                <div key={clave} className="space-y-1">
                  <label
                    htmlFor={`medida-${clave}`}
                    className="block font-sans text-[12px] text-jk-gold-deep"
                  >
                    {etiqueta}
                  </label>
                  <input
                    id={`medida-${clave}`}
                    type="number"
                    min="1"
                    inputMode="numeric"
                    placeholder="cm"
                    value={medidas?.[clave]?.toString() ?? ""}
                    onChange={(event) =>
                      fijarMedidas({
                        ...(medidas ?? {}),
                        [clave]: Number(event.target.value),
                      })
                    }
                    className="w-full rounded-md border border-jk-mist px-2 py-1.5 font-sans text-[13px] text-jk-ink outline-none focus:border-jk-gold-deep focus:ring-2 focus:ring-jk-gold-deep/40"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 font-sans text-[11px] leading-relaxed text-jk-gold-deep">
              Vista referencial: el modelo es una aproximación de las proporciones.
            </p>
          </div>
        )}

        <div className={medidasBase ? "mt-5 border-t border-jk-gold/40 pt-4" : "mt-5"}>
          <h4 className="font-sans text-[13px] font-medium text-jk-ink">Color del mueble</h4>

          <div
            role="group"
            aria-label="Acabados disponibles"
            className="mt-3 grid grid-cols-6 gap-2.5"
          >
            {opciones.map((opcion) => {
              const seleccionado = elegido?.hex.toUpperCase() === opcion.hex;
              return (
                <button
                  key={opcion.hex}
                  type="button"
                  onClick={() => setColorMueble(opcion)}
                  aria-pressed={seleccionado}
                  title={opcion.nombre}
                  style={{ backgroundColor: opcion.hex }}
                  className={`aspect-square rounded-full border-2 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold-deep ${
                    seleccionado
                      ? "border-jk-gold-deep ring-2 ring-jk-gold-deep ring-offset-2"
                      : "border-jk-mist hover:border-jk-gold-deep"
                  }`}
                >
                  <span className="sr-only">{opcion.nombre}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label
              htmlFor="color-personalizado"
              className="block font-sans text-[12px] text-jk-gold-deep"
            >
              Color personalizado
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="color-personalizado"
                type="color"
                value={color}
                onChange={(event) =>
                  setColorMueble({ nombre: "Personalizado", hex: event.target.value.toUpperCase() })
                }
                className="h-10 w-14 cursor-pointer rounded border border-jk-mist bg-white p-1"
              />
              <span className="font-sans text-[13px] text-jk-gold-deep">
                {elegido ? `${elegido.nombre} · ${elegido.hex}` : "Acabado original"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGirar((valor) => !valor)}
            aria-pressed={girar}
            className={`rounded-full border px-4 py-2 font-sans text-[13px] transition-colors ${
              girar
                ? "border-jk-gold-deep bg-jk-gold-deep text-white"
                : "border-jk-gold text-jk-gold-deep hover:bg-jk-cream"
            }`}
          >
            {girar ? "Detener rotación" : "Rotación automática"}
          </button>

          <button
            type="button"
            onClick={() => {
              setColorMueble(null);
              fijarMedidas(null);
            }}
            className="rounded-full border border-jk-gold px-4 py-2 font-sans text-[13px] text-jk-gold-deep transition-colors hover:bg-jk-cream"
          >
            Restablecer
          </button>
        </div>
      </aside>
    </div>
  );
}
