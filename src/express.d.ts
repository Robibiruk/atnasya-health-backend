// Global type augmentation for Express request — attaches decoded Firebase user.
import { Request } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        name?: string;
        [key: string]: unknown;
      };
    }
  }
}

export {};
