import { Request, Response, NextFunction } from "express";
import { z } from "zod";

/**
 * Middleware factory: validates req.body against a Zod schema.
 * Returns 400 with structured error messages on failure.
 */
export const validateBody = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({ success: false, message: "Validation error", errors });
      return;
    }
    // Replace req.body with the parsed (and coerced) data
    req.body = result.data;
    next();
  };
};

/**
 * Middleware factory: validates a route param (e.g., :id) against a Zod schema.
 * Wraps the param value as { [paramName]: value } before validation.
 */
export const validateParam = (paramName: string, schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({ [paramName]: req.params[paramName] });
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({ success: false, message: "Invalid parameter", errors });
      return;
    }
    next();
  };
};

/**
 * Middleware factory: validates req.query against a Zod schema.
 */
export const validateQuery = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({ success: false, message: "Invalid query parameter", errors });
      return;
    }
    next();
  };
};
