import { defineMiddleware } from "astro:middleware";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith("/admin")) {
    const token = context.cookies.get("token")?.value;

    if (!token) {
      return context.redirect("/login");
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        context.cookies.delete("token");
        return context.redirect("/login");
      }

      const data = await res.json();
      if (data.data.role !== "admin") {
        return context.redirect("/");
      }
    } catch {
      context.cookies.delete("token");
      return context.redirect("/login");
    }
  }

  return next();
});
