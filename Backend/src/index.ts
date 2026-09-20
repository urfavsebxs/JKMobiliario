import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { connectDB } from "./config/database";
import { ensureBucket, ensurePrivateBucket } from "./config/minio";
import { errorHandler } from "./middlewares/errorHandler";
import { accessControl } from "./middlewares/accessControl";
import { exigirPasswordCambiada } from "./middlewares/exigirPasswordCambiada";
import authRoutes from "./modules/auth/auth.routes";
import productRoutes from "./modules/products/product.routes";
import categoryRoutes from "./modules/categories/category.routes";
import comprobanteRoutes from "./modules/comprobantes/comprobante.routes";
import userRoutes from "./modules/users/user.routes";

const app = express();

// Caddy escucha en 443 y reenvía a este proceso en localhost:4000, así que
// TODAS las peticiones llegan desde la IP del proxy. Sin esto, `req.ip` es
// siempre "127.0.0.1" y los rate limiters de `express-rate-limit` cuentan a
// todos los visitantes bajo la misma clave: medido con el código real, 10
// intentos fallidos de login de un solo visitante dejan en 429 a todos los
// demás durante los 15 minutos de la ventana. Además, con `trust proxy` en
// false y una cabecera X-Forwarded-For presente, express-rate-limit 8.x lanza
// `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` en cada petición (quedaba en los logs de
// producción) y descarta su propia clave.
//
// `1` = confiar en exactamente un salto (Caddy). NO se usa `true`: confiar en
// toda la cadena dejaría que un cliente falsificara X-Forwarded-For y se
// saltara el límite rotando el valor.
//
// OJO al desplegar en Vercel: ahí el salto de proxy es distinto y hay que
// revisar este valor; este backend corre en el servidor con pm2 detrás de Caddy.
app.set("trust proxy", 1);

// ─── Security headers ────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, mobile apps)
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

// ─── Body parsing with size limit ────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ─── Health check (before access control) ────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Database connection ──────────────────────────────────────────────
// Lazy connect on first request: required on serverless (Vercel), where a
// single instance may be reused across invocations. Cached by connectDB.
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

// ─── Access control middleware ────────────────────────────────────────
app.use(accessControl);

// ─── Contraseña temporal ──────────────────────────────────────────────
// Global, igual que accessControl, para que ningún módulo futuro pueda
// olvidarse de aplicarlo. Solo actúa en rutas con nivel de rol (donde
// accessControl dejó un `req.user`); las públicas y las de n8n quedan intactas.
app.use(exigirPasswordCambiada);

// ─── Routes ──────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/comprobantes", comprobanteRoutes);
app.use("/api/users", userRoutes);

// ─── Global error handler (must be last) ─────────────────────────────
app.use(errorHandler);

export default app;

const start = async (): Promise<void> => {
  await connectDB();
  await ensureBucket();
  // El bucket privado de comprobantes se asegura aparte: `ensureBucket` aplica
  // lectura pública a todos los objetos de su bucket, y un comprobante lleva
  // monto, fecha, banco y nombre del cliente.
  await ensurePrivateBucket();

  // `config.host` es 127.0.0.1 por defecto: Caddy entra por loopback, así que el
  // puerto no queda expuesto a Internet a espaldas del proxy. Ver el comentario
  // en config/index.ts.
  app.listen(config.port, config.host, () => {
    console.log(`Server running on ${config.host}:${config.port}`);
  });
};

// On Vercel the app is imported as a serverless function; only bind a port
// when running locally or in a container.
if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
