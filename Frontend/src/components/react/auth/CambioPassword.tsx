import { useEffect, useState } from "react";
import { adminFetch, ErrorApi, mensajeError } from "../admin/adminApi";
import { destinoTrasCambioPassword } from "../../../lib/rutas";

type Aviso = { tipo: "ok" | "error"; texto: string };

/**
 * Cambio de la contraseña temporal en el primer login.
 *
 * Al terminar limpia la sesión y vuelve al login: el backend sube la versión de
 * los tokens, así que el que traía este usuario deja de valer en la siguiente
 * petición. Volver a entrar no es una cortesía de la pantalla, es la única
 * salida — sin él, cualquier llamada daría 401.
 */
export default function CambioPassword() {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Evita el aviso de "estado actualizado tras desmontar" si el usuario navega
  // mientras la petición está en vuelo.
  const [activo, setActivo] = useState(true);
  useEffect(() => () => setActivo(false), []);

  /**
   * Quien ya cambió su contraseña no tiene nada que hacer aquí.
   *
   * La comprobación vive en la isla y no en el servidor porque aquí se usa el
   * MISMO token que emplean las llamadas (el de `localStorage`): si la cookie
   * del servidor y `localStorage` no coinciden, decidir con la cookie mandaría
   * al usuario a su panel, el panel lo devolvería aquí por el token viejo, y
   * las dos pantallas se rebotarían sin fin.
   */
  useEffect(() => {
    let vigente = true;

    (async () => {
      try {
        const perfil = await adminFetch<{ role?: string; debeCambiarPassword?: boolean }>(
          "/api/auth/profile"
        );
        if (!vigente || perfil?.debeCambiarPassword) return;
        window.location.replace(destinoTrasCambioPassword(perfil.role));
      } catch {
        // 401: `adminFetch` ya redirigió a /login.
      }
    })();

    return () => {
      vigente = false;
    };
  }, []);

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();

    // Validación local antes de la red, igual que en el resto del panel: el
    // backend vuelve a comprobarlo todo, esto solo evita un viaje completo
    // para un error previsible.
    if (!passwordActual) {
      setErrorForm("Escribe tu contraseña temporal actual.");
      return;
    }
    if (passwordNueva.length < 12) {
      setErrorForm("La contraseña nueva debe tener al menos 12 caracteres.");
      return;
    }
    if (passwordNueva === passwordActual) {
      setErrorForm("La contraseña nueva debe ser distinta a la temporal.");
      return;
    }
    if (passwordNueva !== confirmarPassword) {
      setErrorForm("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    setErrorForm(null);
    setAviso(null);

    try {
      await adminFetch<{ debeVolverAEntrar: boolean }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ passwordActual, passwordNueva, confirmarPassword }),
      });

      // El token de esta sesión ya no vale (el backend subió su versión), así
      // que se cierra del todo: cookies httpOnly en el servidor y la copia de
      // localStorage que usan las islas y el Nav.
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Aunque falle la red, la sesión local se limpia igual.
      }
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      window.location.href = "/login?cambio=ok";
    } catch (error) {
      if (!activo) return;
      // El 401 ya redirigió a /login dentro de adminFetch.
      if (error instanceof ErrorApi && error.estado === 401) return;
      const texto = mensajeError(error, "No se pudo cambiar la contraseña");
      setErrorForm(texto);
      setAviso({ tipo: "error", texto });
    } finally {
      if (activo) setGuardando(false);
    }
  };

  const claseInput =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60";

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-lg border-2 border-jk-gold/60 bg-white p-6 shadow">
        <h1 className="text-xl font-bold text-gray-900">Cambia tu contraseña</h1>
        <p className="mt-2 text-sm text-gray-600">
          Tu contraseña es temporal. Elige una que recuerdes para continuar.
        </p>

        {aviso && (
          <div
            role={aviso.tipo === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              aviso.tipo === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {aviso.texto}
          </div>
        )}

        <form onSubmit={enviar} className="mt-5">
          <div className="mb-4">
            <label htmlFor="password-actual" className="mb-1 block text-sm font-medium text-gray-700">
              Contraseña temporal actual
            </label>
            <input
              id="password-actual"
              type="password"
              autoComplete="current-password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              disabled={guardando}
              required
              aria-invalid={Boolean(errorForm)}
              aria-describedby={errorForm ? "cambio-error" : undefined}
              className={claseInput}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password-nueva" className="mb-1 block text-sm font-medium text-gray-700">
              Contraseña nueva
            </label>
            <input
              id="password-nueva"
              type="password"
              autoComplete="new-password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              disabled={guardando}
              required
              minLength={12}
              aria-invalid={Boolean(errorForm)}
              aria-describedby={errorForm ? "cambio-error" : "password-nueva-ayuda"}
              className={claseInput}
            />
            <p id="password-nueva-ayuda" className="mt-1 text-xs text-gray-500">
              Mínimo 12 caracteres, distinta a la temporal.
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="password-confirmar" className="mb-1 block text-sm font-medium text-gray-700">
              Repite la contraseña nueva
            </label>
            <input
              id="password-confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              disabled={guardando}
              required
              aria-invalid={Boolean(errorForm)}
              aria-describedby={errorForm ? "cambio-error" : undefined}
              className={claseInput}
            />
          </div>

          {errorForm && (
            <p id="cambio-error" role="alert" className="mb-3 text-xs text-red-600">
              {errorForm}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {guardando ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          Al guardarla se cerrará tu sesión y tendrás que entrar de nuevo con la contraseña nueva.
        </p>
      </div>
    </div>
  );
}
