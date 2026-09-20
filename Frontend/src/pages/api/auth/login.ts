export const prerender = false;

import type { APIRoute } from "astro";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const tipo = request.headers.get("content-type") || "";
  const esFormulario =
    tipo.includes("application/x-www-form-urlencoded") || tipo.includes("multipart/form-data");

  // El formulario del login funciona con y sin JavaScript: si llega como
  // formulario HTML respondemos con redirecciones; si llega como fetch, JSON.
  let credenciales: { email: string; password: string };
  if (esFormulario) {
    const datos = await request.formData();
    credenciales = {
      email: String(datos.get("email") ?? ""),
      password: String(datos.get("password") ?? ""),
    };
  } else {
    credenciales = await request.json();
  }

  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credenciales),
  });

  const data = await res.json();

  if (!res.ok) {
    if (esFormulario) {
      const mensaje = encodeURIComponent(data.message || "Credenciales incorrectas");
      return redirect(`/login?error=${mensaje}`, 303);
    }
    return new Response(JSON.stringify(data), { status: res.status });
  }

  cookies.set("token", data.data.token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400,
  });

  cookies.set("user", JSON.stringify(data.data.user), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 86400,
  });

  if (esFormulario) {
    const rol = data.data.user.role;
    const destino = rol === "admin" ? "/admin" : rol === "trabajador" ? "/admin/comprobantes" : "/";
    return redirect(destino, 303);
  }

  return new Response(JSON.stringify(data), { status: 200 });
};
