/**
 * Utilidades de red compartidas por las islas del panel admin.
 *
 * Todo el estado de autenticación se lee dentro de funciones (nunca en el
 * scope del módulo): las islas se renderizan primero en el servidor y
 * `localStorage` no existe allí.
 */

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

/** Extrae el mensaje de un error desconocido, con un texto de respaldo. */
export function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof Error ? error.message : porDefecto;
}

/** Error de API con el código HTTP para poder distinguir el 401. */
export class ErrorApi extends Error {
  estado: number;

  constructor(message: string, estado = 0) {
    super(message);
    this.name = "ErrorApi";
    this.estado = estado;
  }
}

export function tokenActual(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

export function redirigirLogin(): void {
  window.location.href = "/login";
}

function mensajeDeRespuesta(json: unknown, porDefecto: string): string {
  if (!json || typeof json !== "object") return porDefecto;
  const cuerpo = json as { message?: string; errors?: Array<{ message?: string }> };
  return cuerpo.errors?.[0]?.message || cuerpo.message || porDefecto;
}

/**
 * Petición JSON autenticada contra el backend. Devuelve `data.data` ya
 * desenvuelto. Ante 401 redirige a /login antes de lanzar el error.
 */
export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenActual();
  if (!token) {
    redirigirLogin();
    throw new ErrorApi("Sesión expirada", 401);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      body: options.body,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ErrorApi("No se pudo conectar con el servidor", 0);
  }

  if (res.status === 401) {
    redirigirLogin();
    throw new ErrorApi("Sesión expirada", 401);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ErrorApi(mensajeDeRespuesta(json, "Error en la solicitud"), res.status);
  }

  return ((json as { data?: T } | null)?.data ?? json) as T;
}

/**
 * Subida multipart con progreso real vía XHR. `fetch` no expone el evento de
 * progreso de subida, y para modelos GLB de varios MB la barra importa.
 */
export function subirArchivoConProgreso<T>(
  path: string,
  campo: string,
  archivo: File,
  onProgreso?: (porcentaje: number) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const token = tokenActual();
    if (!token) {
      redirigirLogin();
      reject(new ErrorApi("Sesión expirada", 401));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && onProgreso) {
        onProgreso(Math.round((evento.loaded / evento.total) * 100));
      }
    };

    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        // Respuesta no JSON (p. ej. error de un proxy): se usa el mensaje genérico.
      }

      if (xhr.status === 401) {
        redirigirLogin();
        reject(new ErrorApi("Sesión expirada", 401));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ErrorApi(mensajeDeRespuesta(json, "Error al subir el archivo"), xhr.status));
        return;
      }

      resolve(((json as { data?: T } | null)?.data ?? json) as T);
    };

    xhr.onerror = () => reject(new ErrorApi("Error de red al subir el archivo", 0));
    xhr.onabort = () => reject(new ErrorApi("Subida cancelada", 0));

    const datos = new FormData();
    datos.append(campo, archivo);
    xhr.send(datos);
  });
}
