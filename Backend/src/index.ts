import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { connectDB } from "./config/database";
import { ensureBucket } from "./config/minio";
import { errorHandler } from "./middlewares/errorHandler";
import { accessControl } from "./middlewares/accessControl";
import authRoutes from "./modules/auth/auth.routes";
import productRoutes from "./modules/products/product.routes";
import categoryRoutes from "./modules/categories/category.routes";

const app = express();

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

// ─── Routes ──────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);

// ─── Global error handler (must be last) ─────────────────────────────
app.use(errorHandler);

export default app;

const start = async (): Promise<void> => {
  await connectDB();
  await ensureBucket();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
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
