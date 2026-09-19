import { useEffect, useMemo, useState } from "react";
import { compararCategorias } from "../../../lib/categorias";
import type { Category } from "../../../lib/types";
import { adminFetch, ErrorApi, mensajeError } from "./adminApi";

type Aviso = { tipo: "ok" | "error"; texto: string };

/**
 * Panel de gestión de categorías del catálogo.
 * Sin props: carga la lista al montar y opera contra /api/categories.
 */
export default function AdminCategorias() {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Formulario de creación
  const [nombre, setNombre] = useState("");
  const [grupo, setGrupo] = useState("");
  const [imagen, setImagen] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  /** id de categoría → true mientras su DELETE está en curso. */
  const [eliminando, setEliminando] = useState<Record<string, boolean>>({});

  const grupos = useMemo(
    () =>
      [...new Set(categorias.map((categoria) => categoria.group).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es")
      ),
    [categorias]
  );

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const lista = await adminFetch<Category[]>("/api/categories");
        if (!activo) return;
        setCategorias([...lista].sort(compararCategorias));
      } catch (error) {
        if (!activo) return;
        // El 401 ya redirige a /login dentro de adminFetch.
        if (error instanceof ErrorApi && error.estado === 401) return;
        setErrorCarga(mensajeError(error, "No se pudieron cargar las categorías"));
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, []);

  const crear = async (evento: React.FormEvent) => {
    evento.preventDefault();
    const nombreLimpio = nombre.trim();

    if (!nombreLimpio) {
      setErrorForm("Escribe un nombre para la categoría.");
      return;
    }

    setCreando(true);
    setErrorForm(null);
    setAviso(null);

    try {
      const creada = await adminFetch<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: nombreLimpio,
          group: grupo.trim() || nombreLimpio,
          image: imagen.trim() || undefined,
        }),
      });

      setCategorias((prev) => [...prev, creada].sort(compararCategorias));
      setNombre("");
      setGrupo("");
      setImagen("");
      setAviso({ tipo: "ok", texto: `Categoría «${creada.name}» creada.` });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al crear la categoría") });
    } finally {
      setCreando(false);
    }
  };

  const eliminar = async (categoria: Category) => {
    if (!window.confirm(`¿Eliminar la categoría «${categoria.name}»?`)) return;

    setAviso(null);
    setEliminando((prev) => ({ ...prev, [categoria._id]: true }));

    try {
      await adminFetch(`/api/categories/${categoria._id}`, { method: "DELETE" });
      setCategorias((prev) => prev.filter((c) => c._id !== categoria._id));
      setAviso({ tipo: "ok", texto: `Categoría «${categoria.name}» eliminada.` });
    } catch (error) {
      // 409 (hay productos que la usan) y 404 (ya no existe): el backend envía
      // el motivo y se muestra tal cual.
      setAviso({ tipo: "error", texto: mensajeError(error, "Error al eliminar la categoría") });
    } finally {
      setEliminando((prev) => {
        const copia = { ...prev };
        delete copia[categoria._id];
        return copia;
      });
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
        <h2 className="text-lg font-semibold text-gray-900">Nueva categoría</h2>
        <p className="mt-1 text-sm text-gray-500">
          Si dejas el grupo vacío, la categoría se agrupará con su propio nombre.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="categoria-nombre"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Nombre
            </label>
            <input
              id="categoria-nombre"
              type="text"
              required
              value={nombre}
              onChange={(evento) => {
                setNombre(evento.target.value);
                if (errorForm) setErrorForm(null);
              }}
              disabled={creando}
              aria-invalid={Boolean(errorForm)}
              aria-describedby={errorForm ? "categoria-nombre-error" : undefined}
              placeholder="Ej: Bibliotecas"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
            {errorForm && (
              <p id="categoria-nombre-error" role="alert" className="mt-1 text-xs text-red-600">
                {errorForm}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="categoria-grupo"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Grupo (opcional)
            </label>
            <input
              id="categoria-grupo"
              type="text"
              list="categoria-grupos"
              value={grupo}
              onChange={(evento) => setGrupo(evento.target.value)}
              disabled={creando}
              placeholder="Ej: Mesas"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
            <datalist id="categoria-grupos">
              {grupos.map((nombreGrupo) => (
                <option key={nombreGrupo} value={nombreGrupo} />
              ))}
            </datalist>
          </div>

          <div>
            <label
              htmlFor="categoria-imagen"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Imagen URL (opcional)
            </label>
            <input
              id="categoria-imagen"
              type="url"
              value={imagen}
              onChange={(evento) => setImagen(evento.target.value)}
              disabled={creando}
              placeholder="https://…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={creando}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {creando ? "Creando…" : "Crear categoría"}
        </button>
      </form>

      {/* Listado */}
      {cargando ? (
        <div className="rounded-lg bg-white p-6 text-center shadow">
          <p role="status" aria-live="polite" className="text-sm text-gray-500">
            Cargando categorías…
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
                    Grupo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Orden
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Imagen
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {categorias.map((categoria) => (
                  <tr key={categoria._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {categoria.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800">
                        {categoria.group || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {categoria.order ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {categoria.image ? (
                        <a
                          href={categoria.image}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-900 underline transition-colors hover:text-gray-600"
                        >
                          Ver
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => void eliminar(categoria)}
                        disabled={eliminando[categoria._id]}
                        className="text-red-600 transition-colors hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {eliminando[categoria._id] ? "Eliminando…" : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {categorias.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">Todavía no hay categorías.</p>
          )}
        </div>
      )}
    </div>
  );
}
