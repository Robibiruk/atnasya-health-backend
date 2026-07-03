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

  // Dev bypass: when Firebase isn't configured, accept a dev token of the form
  // "dev:<firebaseUid>" so local development and tests can proceed.
  if (process.env.ATNASYA_DEV_AUTH === "1" && token.startsWith("dev:")) {
    const uid = token.slice(4);
    req.user = { uid, email: `${uid}@dev.local`, name: "Dev User" };
    next();
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
