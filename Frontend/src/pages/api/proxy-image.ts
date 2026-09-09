import type { APIRoute } from "astro";

/**
 * Proxy de imágenes: resuelve el problema de Mixed Content
 * cuando MinIO está en HTTP y el frontend en HTTPS (Vercel).
 *
 * Uso: /api/proxy-image?url=http://minio:9000/bucket/path/image.jpg
 */
export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validar que la URL sea de MinIO (seguridad: no permitir proxy arbitrario)
  const allowedHosts = [
    process.env.MINIO_ENDPOINT || "2.25.126.250",
    "localhost",
    "127.0.0.1",
  ];

  try {
    const parsedUrl = new URL(imageUrl);
    const isAllowed = allowedHosts.some(
      (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch la imagen desde MinIO (server-side, sin Mixed Content)
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Image not found" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Obtener el content-type de la respuesta
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Retornar la imagen con cache de 1 hora
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch image" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
