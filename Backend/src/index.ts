import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDB } from "./config/database";
import { ensureBucket } from "./config/minio";
import { errorHandler } from "./middlewares/errorHandler";
import { accessControl } from "./middlewares/accessControl";
import authRoutes from "./modules/auth/auth.routes";
import productRoutes from "./modules/products/product.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(accessControl);

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);

app.use(errorHandler);

const start = async () => {
  await connectDB();
  await ensureBucket();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
};

start();
