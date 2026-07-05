// Auth middleware — verifies Firebase ID token and attaches decoded user to req.
/// <reference path="../express.d.ts" />
import { Request, Response, NextFunction } from "express";
import admin, { initFirebaseAdmin } from "../firebaseAdmin";

initFirebaseAdmin();

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split("Bearer ")[1] : null;

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}
