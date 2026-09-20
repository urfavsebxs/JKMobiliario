import { useEffect, useState } from "react";
import type { UsuarioConCredencial, UsuarioPanel } from "../../../lib/types";
import { adminFetch, ErrorApi, mensajeError } from "./adminApi";

type Aviso = { tipo: "ok" | "error"; texto: string };

/** Roles que se pueden asignar desde el panel, con su etiqueta legible. */
const ROLES = [
  { valor: "trabajador", etiqueta: "Trabajador — solo revisa comprobantes" },
  { valor: "admin", etiqueta: "Administrador — acceso total al panel" },
];

const formatearFecha = (fecha: string): string => {
  const d = new Date(fecha);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Alta y gestión de cuentas del panel.
 *
 * La contraseña temporal se muestra UNA vez y no se guarda en ningún sitio: si
 * se pierde, se regenera. Por eso no se ofrece "ver contraseña" en la tabla.
 */
export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Formulario de creación
  const [name, setNombre] = useState("");
  const [email, setCorreo] = useState("");
  const [role, setRol] = useState("trabajador");
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  /** Credencial recién generada: el único momento en que existe en claro. */
  const [credencial, setCredencial] = useState<UsuarioConCredencial | null>(null);
  const [copiado, setCopiado] = useState(false);

  /** id de usuario → true mientras su PATCH está en curso. */
  const [ocupado, setOcupado] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const lista = await adminFetch<UsuarioPanel[]>("/api/users");
        if (!activo) return;
        setUsuarios(lista);
      } catch (error) {
        if (!activo) return;
        // El 401 ya redirige a /login dentro de adminFetch.
        if (error instanceof ErrorApi && error.estado === 401) return;
        setErrorCarga(mensajeError(error, "No se pudieron cargar los usuarios"));
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, []);

  /** Marca/desmarca la fila como ocupada sin pisar las demás. */
  const ocupar = (id: string, valor: boolean) =>
    setOcupado((prev) => {
      const copia = { ...prev };
      if (valor) copia[id] = true;
      else delete copia[id];
      return copia;
    });

  const crear = async (evento: React.FormEvent) => {
    evento.preventDefault();

    const nombreLimpio = name.trim();
    const correoLimpio = email.trim();
    if (!nombreLimpio) {
      setErrorForm("Escribe el nombre del trabajador.");
      return;
    }
    if (!correoLimpio) {
      setErrorForm("Escribe el correo con el que iniciará sesión.");
      return;
    }

    setCreando(true);
    setErrorForm(null);
    setAviso(null);
    setCredencial(null);
    setCopiado(false);

    try {
      const respuesta = await adminFetch<UsuarioConCredencial>("/api/users", {
        method: "POST",
        body: JSON.stringify({ name: nombreLimpio, email: correoLimpio, role }),
      });

      setUsuarios((prev) => [...prev, respuesta.usuario]);
      setCredencial(respuesta);
      setNombre("");
      setCorreo("");
      setRol("trabajador");
      setAviso({
        tipo: "ok",
        texto: `Cuenta creada para ${respuesta.usuario.name}. Copia la contraseña y entrégasela.`,
      });
    } catch (error) {
      // 409 (correo repetido) y 400 (validación): el backend envía el motivo.
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al crear el usuario") });
    } finally {
      setCreando(false);
    }
  };

  const copiarCredencial = async (usuario: UsuarioConCredencial) => {
    const texto = `Usuario: ${usuario.usuario.email}\nContraseña temporal: ${usuario.passwordTemporal}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles (http, navegador viejo): se selecciona a mano.
      setAviso({
        tipo: "error",
        texto: "No se pudo copiar automáticamente. Selecciona la contraseña y cópiala a mano.",
      });
    }
  };

  const cambiarActivo = async (usuario: UsuarioPanel) => {
    const accion = usuario.activo ? "desactivar" : "reactivar";
    if (!window.confirm(`¿Seguro que quieres ${accion} la cuenta de ${usuario.name}?`)) return;

    setAviso(null);
    ocupar(usuario._id, true);

    try {
      const actualizado = await adminFetch<UsuarioPanel>(`/api/users/${usuario._id}/activo`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !usuario.activo }),
      });
      setUsuarios((prev) => prev.map((u) => (u._id === actualizado._id ? actualizado : u)));
      setAviso({
        tipo: "ok",
        texto: `Cuenta de ${actualizado.name} ${actualizado.activo ? "reactivada" : "desactivada"}.`,
      });
    } catch (error) {
      // 400 (tu propia cuenta) y 409 (último admin activo): mensaje del backend.
      setAviso({ tipo: "error", texto: mensajeError(error, `Error al ${accion} la cuenta`) });
    } finally {
      ocupar(usuario._id, false);
    }
  };

  const regenerar = async (usuario: UsuarioPanel) => {
    const mensaje = usuario.activo
      ? `¿Generar una contraseña temporal nueva para ${usuario.name}? La anterior dejará de servir y su sesión actual se cerrará.`
      : `¿Generar una contraseña temporal nueva para ${usuario.name}? Sigue desactivada: deberás reactivarla para que pueda entrar.`;
    if (!window.confirm(mensaje)) return;

    setAviso(null);
    setCredencial(null);
    setCopiado(false);
    ocupar(usuario._id, true);

    try {
      const respuesta = await adminFetch<UsuarioConCredencial>(
        `/api/users/${usuario._id}/password-temporal`,
        { method: "POST" }
      );
      setUsuarios((prev) => prev.map((u) => (u._id === respuesta.usuario._id ? respuesta.usuario : u)));
      setCredencial(respuesta);
      setAviso({
        tipo: "ok",
        texto: `Contraseña temporal nueva para ${respuesta.usuario.name}. Copia y entrégala.`,
      });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al generar la contraseña") });
    } finally {
      ocupar(usuario._id, false);
    }
  };

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          role={aviso.tipo === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            aviso.tipo === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* Creación */}
      <form onSubmit={crear} className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">Nueva cuenta</h2>
        <p className="mt-1 text-sm text-gray-500">
          La contraseña la genera el sistema y se muestra una sola vez. Al entrar por primera vez, el
          trabajador tendrá que cambiarla por una que recuerde.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="usuario-nombre" className="mb-1 block text-sm font-medium text-gray-700">
              Nombre
            </label>
            <input
              id="usuario-nombre"
              type="text"
              required
              value={name}
              onChange={(evento) => {
                setNombre(evento.target.value);
                if (errorForm) setErrorForm(null);
              }}
              disabled={creando}
              aria-invalid={Boolean(errorForm)}
              aria-describedby={errorForm ? "usuario-nombre-error" : undefined}
              placeholder="Ej: Juan Pérez"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="usuario-email" className="mb-1 block text-sm font-medium text-gray-700">
              Correo
            </label>
            <input
              id="usuario-email"
              type="email"
              required
              value={email}
              onChange={(evento) => {
                setCorreo(evento.target.value);
                if (errorForm) setErrorForm(null);
              }}
              disabled={creando}
              aria-invalid={Boolean(errorForm)}
              aria-describedby={errorForm ? "usuario-nombre-error" : undefined}
              placeholder="trabajador@jkmobiliario.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="usuario-rol" className="mb-1 block text-sm font-medium text-gray-700">
              Rol
            </label>
            <select
              id="usuario-rol"
              value={role}
              onChange={(evento) => setRol(evento.target.value)}
              disabled={creando}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            >
              {ROLES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorForm && (
          <p id="usuario-nombre-error" role="alert" className="mt-3 text-xs text-red-600">
            {errorForm}
          </p>
        )}

        <button
          type="submit"
          disabled={creando}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {creando ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      {/* Credencial recién generada — se muestra una sola vez */}
      {credencial && (
        <div className="rounded-lg border-2 border-jk-gold/60 bg-white p-4 shadow sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Contraseña temporal de {credencial.usuario.name}
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            <strong>Esta contraseña no se volverá a mostrar.</strong> Cópiala ahora y entrégasela al
            trabajador por un medio privado. Caduca en 7 días y, al entrar, tendrá que cambiarla.
          </p>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="font-medium text-gray-700">Correo:</dt>
              <dd className="break-all text-gray-900">{credencial.usuario.email}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="font-medium text-gray-700">Contraseña temporal:</dt>
              <dd>
                <code className="select-all rounded bg-gray-100 px-2 py-1 font-mono text-base text-gray-900">
                  {credencial.passwordTemporal}
                </code>
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copiarCredencial(credencial)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              {copiado ? "Copiado ✓" : "Copiar usuario y contraseña"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCredencial(null);
                setCopiado(false);
              }}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300"
            >
              Ya la copié, ocultar
            </button>
          </div>
        </div>
      )}

      {/* Listado */}
      {cargando ? (
        <div className="rounded-lg bg-white p-6 text-center shadow">
          <p role="status" aria-live="polite" className="text-sm text-gray-500">
            Cargando usuarios…
          </p>
        </div>
      ) : errorCarga ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700">{errorCarga}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Correo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Creada
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {usuarios.map((usuario) => (
                  <tr key={usuario._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{usuario.name}</td>
                    <td className="break-all px-6 py-4 text-sm text-gray-600">{usuario.email}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800">
                        {usuario.role === "admin" ? "Administrador" : "Trabajador"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {usuario.activo ? (
                        <span className="text-green-700">Activa</span>
                      ) : (
                        <span className="text-red-600">Desactivada</span>
                      )}
                      {usuario.debeCambiarPassword && (
                        <span className="ml-2 text-xs text-gray-500">(sin entrar aún)</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatearFecha(usuario.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => void regenerar(usuario)}
                        disabled={ocupado[usuario._id]}
                        aria-label={`Generar contraseña temporal para ${usuario.name}`}
                        className="mr-3 text-gray-900 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {ocupado[usuario._id] ? "Generando…" : "Nueva contraseña"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void cambiarActivo(usuario)}
                        disabled={ocupado[usuario._id]}
                        aria-label={`${usuario.activo ? "Desactivar" : "Reactivar"} a ${usuario.name}`}
                        className={`transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          usuario.activo
                            ? "text-red-600 hover:text-red-800"
                            : "text-green-700 hover:text-green-900"
                        }`}
                      >
                        {usuario.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {usuarios.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">Todavía no hay cuentas.</p>
          )}
        </div>
      )}
    </div>
  );
}
