// Global error handler — must be mounted last in index.ts.
import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  res.status(500).json({ success: false, error: "Internal server error" });
}
