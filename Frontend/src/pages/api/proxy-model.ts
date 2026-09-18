import type { APIRoute } from "astro";

/**
 * Proxy de modelos 3D (GLB): resuelve el problema de Mixed Content
 * cuando MinIO está en HTTP y el frontend en HTTPS (Vercel).
 *
 * Uso: /api/proxy-model?url=http://minio:9000/bucket/path/mueble.glb
 *
 * NOTA Vercel: las respuestas de las funciones serverless tienen un límite de
 * ~4.5 MB. Los modelos más pesados que ese límite no se pueden entregar por
 * esta vía: deben servirse directamente desde MinIO por HTTPS.
 */
export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const modelUrl = searchParams.get("url");

  const errorJson = (error: string, status: number) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (!modelUrl) {
    return errorJson("Missing 'url' query parameter", 400);
  }

  // Allowlist explícita: el MinIO configurado y los hosts públicos conocidos.
  const allowedHosts = [
    ...(process.env.MINIO_ENDPOINT ? [process.env.MINIO_ENDPOINT] : []),
    "api.jkmobiliario.digital",
    "2.25.126.250",
  ];

  // localhost/127.0.0.1 quedan prohibidos salvo opt-in explícito (desarrollo).
  if (process.env.PROXY_ALLOW_LOCALHOST === "true") {
    allowedHosts.push("localhost", "127.0.0.1");
  }

  try {
    const parsedUrl = new URL(modelUrl);

    // Solo http(s): evita file://, data: u otros esquemas en el fetch servidor.
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return errorJson("Protocol not allowed", 400);
    }

    const isAllowed = allowedHosts.some(
      (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowed) {
      return errorJson("Host not allowed", 403);
    }

    // `redirect: "error"` impide saltar a hosts no permitidos y el timeout
    // evita que la función quede colgada si MinIO no responde.
    const response = await fetch(modelUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return response.status === 404
        ? errorJson("Model not found", 404)
        : errorJson("Failed to fetch model", 500);
    }

    // MinIO suele devolver application/octet-stream; el visor espera el tipo
    // glTF binario, así que se prioriza siempre model/gltf-binary.
    // Sin CORS: el proxy es same-origin y no necesita Access-Control-Allow-Origin.
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return errorJson("Failed to fetch model", 500);
  }
};
