export const prerender = false;

import type { APIRoute } from "astro";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json();

  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
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

  return new Response(JSON.stringify(data), { status: 200 });
};
