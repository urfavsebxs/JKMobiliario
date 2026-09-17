import mongoose from "mongoose";
import { config } from "./index";

let connectionPromise: Promise<void> | null = null;

export const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose
    .connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
    .then(() => {
      console.log("MongoDB connected");
    })
    .catch((error) => {
      connectionPromise = null;
      console.error("MongoDB connection error:", error);
      throw error;
    });

  return connectionPromise;
};
