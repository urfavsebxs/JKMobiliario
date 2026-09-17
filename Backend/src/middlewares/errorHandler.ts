import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handler.
 * - Operational errors (statusCode < 500): exposes the error message to the client.
 * - System errors (statusCode >= 500 or unknown): returns a generic message,
 *   logs the full error server-side only.
 */
export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction): void => {
  const statusCode = err.statusCode ?? 500;
  const isOperational = err.isOperational ?? (typeof err.statusCode === "number" && err.statusCode < 500);

  // Always log the full error server-side
  console.error(`[Error] ${statusCode} - ${err.message}`, err.stack);

  // Only expose message for operational (client) errors
  const message = isOperational ? err.message : "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
  });
};
