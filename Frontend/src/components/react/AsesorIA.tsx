import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Widget del "Asesor IA" de JK Mobiliario.
 *
 * - Se hidrata con `client:idle` (ver Layout.astro) para no afectar los CWV.
 * - Envía el historial a `/api/asesor` (proxy server-side de Gemini), por lo
 *   que la API key nunca llega al navegador.
 * - Accesible: diálogo modal con trampa de foco, Escape, foco de retorno,
 *   `aria-live` para los mensajes nuevos y respeto por `prefers-reduced-motion`.
 */

// ─── Contrato con /api/asesor ────────────────────────────────────────
interface Mensaje {
  rol: "usuario" | "asesor";
  texto: string;
  esError?: boolean;
}

const CLAVE_SESION = "jk:asesor:chat:v1";
const MAX_TEXTO = 500;
/** Debe coincidir con MAX_MENSAJES del endpoint. */
const MAX_ENVIADOS = 12;
const MAX_GUARDADOS = 40;
const TIMEOUT_CLIENTE_MS = 30_000;

const BIENVENIDA: Mensaje = {
  rol: "asesor",
  texto:
    "Hola, soy el Asesor IA de JK Mobiliario. Cuéntame qué mueble necesitas: te ayudo con modelos, precios, medidas, colores y cómo cotizar.",
};

const SUGERENCIAS = [
  "¿Qué camas tienen y cuánto cuestan?",
  "¿Qué medidas y colores manejan?",
  "¿Cómo pido una cotización?",
] as const;

const whatsapp = import.meta.env.PUBLIC_WHATSAPP_NUMBER || "";
const urlWhatsApp = (texto: string) =>
  whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`
    : "/#contacto";

function esMensaje(valor: unknown): valor is Mensaje {
  if (typeof valor !== "object" || valor === null) return false;
  const { rol, texto } = valor as Record<string, unknown>;
  return (
    (rol === "usuario" || rol === "asesor") &&
    typeof texto === "string" &&
    texto.length > 0 &&
    texto.length <= 4000
  );
}

/**
 * Gemini a veces devuelve Markdown (p. ej. **301 517 9340**). El panel muestra
 * texto plano, así que se limpian los marcadores más comunes en lugar de
 * inyectar HTML (nada de `dangerouslySetInnerHTML`). Patrones lineales, sin
 * riesgo de retroceso catastrófico.
 */
function limpiarFormato(texto: string): string {
  return texto
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1");
}

function IconoChat() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.2A8 8 0 1 1 21 12Z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </svg>
  );
}

function IconoWhatsApp() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" />
      <path d="M8.8 9.2c0 3.3 2.7 6 6 6l1.2-1.7-2-.8-.8.9a4.6 4.6 0 0 1-2.3-2.3l.9-.8-.8-2-1.7 1.2Z" />
    </svg>
  );
}

export default function AsesorIA() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([BIENVENIDA]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const focoPrevioRef = useRef<HTMLElement | null>(null);
  const enviandoRef = useRef(false);

  // ─── Historial en sessionStorage (nunca localStorage) ──────────────
  useEffect(() => {
    try {
      const crudo = sessionStorage.getItem(CLAVE_SESION);
      if (crudo) {
        const datos: unknown = JSON.parse(crudo);
        if (Array.isArray(datos)) {
          const validos = datos.filter(esMensaje);
          if (validos.length > 0) setMensajes(validos.slice(-MAX_GUARDADOS));
        }
      }
    } catch {
      // sessionStorage bloqueado o JSON corrupto: se arranca con la bienvenida.
    }
    setHidratado(true);
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(mensajes.slice(-MAX_GUARDADOS)));
    } catch {
      // Sin persistencia disponible: la conversación sigue en memoria.
    }
  }, [mensajes, hidratado]);

  // ─── Apertura/cierre con foco gestionado ───────────────────────────
  const abrir = useCallback((origen?: HTMLElement | null) => {
    focoPrevioRef.current =
      origen ?? (document.activeElement as HTMLElement | null) ?? null;
    setAbierto(true);
  }, []);

  const cerrar = useCallback(() => {
    setAbierto(false);
    window.requestAnimationFrame(() => focoPrevioRef.current?.focus?.());
  }, []);

  // Escape + trampa de foco + bloqueo del scroll de fondo.
  useEffect(() => {
    if (!abierto) return;
    const panel = panelRef.current;
    areaRef.current?.focus();

    const alTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        cerrar();
        return;
      }
      if (evento.key !== "Tab" || !panel) return;

      const enfocables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((elemento) => elemento.offsetParent !== null);

      if (enfocables.length === 0) return;
      const primero = enfocables[0]!;
      const ultimo = enfocables[enfocables.length - 1]!;

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", alTeclado);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, cerrar]);

  // ─── Integración: elementos con [data-jk-asesor] abren el chat ─────
  // Los botones del home y del footer conservan su href de WhatsApp como
  // fallback sin JavaScript; el preventDefault solo ocurre cuando el widget
  // ya está montado e hidratado.
  useEffect(() => {
    const alClic = (evento: MouseEvent) => {
      if (evento.defaultPrevented || evento.button !== 0) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;

      const objetivo = evento.target as Element | null;
      const disparador = objetivo?.closest?.("[data-jk-asesor]");
      if (!disparador) return;

      evento.preventDefault();
      abrir(disparador as HTMLElement);
    };

    document.addEventListener("click", alClic);

    // Mejora progresiva de accesibilidad para los disparadores del sitio.
    document.querySelectorAll("[data-jk-asesor]").forEach((elemento) => {
      elemento.setAttribute("aria-haspopup", "dialog");
    });

    return () => document.removeEventListener("click", alClic);
  }, [abrir]);

  // ─── Auto-scroll y auto-alto del textarea ──────────────────────────
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lista.scrollTo({ top: lista.scrollHeight, behavior: reducido ? "auto" : "smooth" });
  }, [mensajes, cargando, abierto]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 120)}px`;
  }, [entrada, abierto]);

  // ─── Envío ─────────────────────────────────────────────────────────
  const enviar = useCallback(
    async (textoForzado?: string) => {
      const texto = (textoForzado ?? entrada).trim();
      if (!texto || enviandoRef.current) return;

      enviandoRef.current = true;
      setCargando(true);
      setEntrada("");

      const conUsuario: Mensaje[] = [...mensajes, { rol: "usuario", texto }];
      setMensajes(conUsuario);

      const historial = conUsuario
        .filter((mensaje) => !mensaje.esError)
        .slice(-MAX_ENVIADOS)
        .map(({ rol, texto: contenido }) => ({ rol, texto: contenido }));

      try {
        const respuesta = await fetch("/api/asesor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensajes: historial }),
          signal: AbortSignal.timeout(TIMEOUT_CLIENTE_MS),
        });

        const datos = (await respuesta.json().catch(() => null)) as {
          respuesta?: string;
          error?: string;
        } | null;

        if (!respuesta.ok || !datos?.respuesta?.trim()) {
          const detalle =
            datos?.error?.trim() || "No pudimos obtener respuesta del asesor.";
          setMensajes((previos) => [
            ...previos,
            { rol: "asesor", texto: detalle, esError: true },
          ]);
          return;
        }

        setMensajes((previos) => [
          ...previos,
          { rol: "asesor", texto: limpiarFormato(datos.respuesta!.trim()) },
        ]);
      } catch {
        setMensajes((previos) => [
          ...previos,
          {
            rol: "asesor",
            texto:
              "No pudimos conectar con el asesor. Revisa tu conexión o escríbenos por WhatsApp.",
            esError: true,
          },
        ]);
      } finally {
        enviandoRef.current = false;
        setCargando(false);
      }
    },
    [entrada, mensajes],
  );

  const puedeEnviar = entrada.trim().length > 0 && !cargando;
  const mostrarSugerencias = mensajes.length === 1 && !cargando;

  return (
    <>
      {/* Burbuja flotante. En móvil se oculta al abrir para no tapar el panel. */}
      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? cerrar() : abrir(botonRef.current))}
        aria-label={abierto ? "Cerrar el asesor IA" : "Abrir el asesor IA"}
        aria-expanded={abierto}
        aria-controls="jk-asesor-panel"
        className={`fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] h-14 w-14 items-center justify-center rounded-full bg-jk-gold text-jk-ink shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold motion-safe:transition-transform sm:right-6 sm:bottom-6 ${
          abierto ? "hidden sm:flex" : "flex"
        }`}
      >
        {abierto ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <IconoChat />
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[80]">
          <div
            className="absolute inset-0 bg-black/60 motion-safe:animate-[jk-asesor-fade_150ms_ease-out]"
            onClick={cerrar}
            aria-hidden="true"
          />

          <section
            ref={panelRef}
            id="jk-asesor-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="jk-asesor-titulo"
            className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-2xl border border-jk-gold/40 bg-jk-ink text-white shadow-[0_-8px_40px_rgba(0,0,0,0.6)] motion-safe:animate-[jk-asesor-in_200ms_ease-out] sm:inset-x-auto sm:right-6 sm:bottom-24 sm:max-h-[min(620px,calc(100dvh-7.5rem))] sm:w-[400px] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 border-b border-jk-gold/30 px-4 py-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jk-gold text-jk-ink"
                aria-hidden="true"
              >
                <IconoChat />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="jk-asesor-titulo"
                  className="font-brand text-[20px] font-semibold leading-tight text-jk-gold"
                >
                  Asesor IA
                </h2>
                <p className="font-sans text-[12px] leading-tight text-white/70">
                  JK Mobiliario · Medellín
                </p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar el asesor IA"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div
              ref={listaRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="Conversación con el asesor IA"
              className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
            >
              <ul className="flex flex-col gap-3">
                {mensajes.map((mensaje, indice) => (
                  <li
                    key={indice}
                    className={mensaje.rol === "usuario" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 font-sans text-[14px] leading-[1.45] break-words whitespace-pre-wrap ${
                        mensaje.rol === "usuario"
                          ? "rounded-br-sm bg-jk-gold text-jk-ink"
                          : mensaje.esError
                            ? "rounded-bl-sm border border-red-400/40 bg-red-950/70 text-red-50"
                            : "rounded-bl-sm bg-jk-cream text-jk-ink"
                      }`}
                    >
                      <span className="sr-only">
                        {mensaje.rol === "usuario" ? "Tú: " : "Asesor IA: "}
                      </span>
                      {mensaje.texto}
                      {mensaje.esError && (
                        <a
                          href={urlWhatsApp("Hola, necesito asesoría sobre muebles.")}
                          target={whatsapp ? "_blank" : undefined}
                          rel={whatsapp ? "noopener noreferrer" : undefined}
                          className="mt-2 flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-jk-gold px-3 font-label text-[14px] font-medium text-jk-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                          Escribir por WhatsApp
                        </a>
                      )}
                    </div>
                  </li>
                ))}

                {cargando && (
                  <li className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm bg-jk-cream px-4 py-3 text-jk-ink">
                      <span className="sr-only">El asesor está escribiendo</span>
                      <span aria-hidden="true" className="flex items-center gap-1">
                        {[0, 1, 2].map((indice) => (
                          <span
                            key={indice}
                            className="h-1.5 w-1.5 rounded-full bg-jk-gold-deep motion-safe:animate-bounce"
                            style={{ animationDelay: `${indice * 120}ms` }}
                          />
                        ))}
                      </span>
                    </div>
                  </li>
                )}
              </ul>

              {mostrarSugerencias && (
                <ul className="flex flex-wrap gap-2 pt-1" aria-label="Preguntas sugeridas">
                  {SUGERENCIAS.map((sugerencia) => (
                    <li key={sugerencia}>
                      <button
                        type="button"
                        onClick={() => void enviar(sugerencia)}
                        className="min-h-[44px] rounded-full border border-jk-gold/50 px-3.5 py-2 font-sans text-[13px] text-jk-gold transition-colors hover:bg-jk-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
                      >
                        {sugerencia}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                void enviar();
              }}
              className="border-t border-jk-gold/30 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              {/* CTA permanente: la cotización final siempre se cierra con un
                  asesor humano, esté o no disponible la IA. */}
              <a
                href={urlWhatsApp("Hola, quiero cotizar un mueble.")}
                target={whatsapp ? "_blank" : undefined}
                rel={whatsapp ? "noopener noreferrer" : undefined}
                className="mb-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-jk-gold/50 bg-jk-gold/10 px-3 font-label text-[14px] font-medium text-jk-gold transition-colors hover:bg-jk-gold/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold"
              >
                <IconoWhatsApp />
                Cotizar por WhatsApp
              </a>

              <div className="flex items-end gap-2 rounded-xl border border-jk-gold/40 bg-white/5 p-1.5 focus-within:border-jk-gold">
                <label htmlFor="jk-asesor-entrada" className="sr-only">
                  Escribe tu mensaje para el asesor
                </label>
                <textarea
                  id="jk-asesor-entrada"
                  ref={areaRef}
                  rows={1}
                  maxLength={MAX_TEXTO}
                  value={entrada}
                  onChange={(evento) => setEntrada(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key !== "Enter" || evento.shiftKey) return;
                    if (evento.nativeEvent.isComposing) return;
                    evento.preventDefault();
                    if (puedeEnviar) void enviar();
                  }}
                  placeholder="Escribe tu mensaje"
                  autoComplete="off"
                  className="max-h-[120px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 font-sans text-[15px] text-white placeholder:text-white/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!puedeEnviar}
                  aria-label="Enviar mensaje"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-jk-gold text-jk-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jk-gold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M4.5 12 20 4.5 12.5 20l-2-6.5-6-1.5Z" />
                  </svg>
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
                <p className="font-sans text-[11px] text-white/50">
                  Enter envía · Shift+Enter salta de línea
                </p>
                {entrada.length > MAX_TEXTO - 100 && (
                  <p className="font-sans text-[11px] text-jk-gold" aria-live="polite">
                    {entrada.length}/{MAX_TEXTO}
                  </p>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
