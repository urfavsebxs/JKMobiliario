export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete("token", { path: "/" });
  cookies.delete("user", { path: "/" });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
