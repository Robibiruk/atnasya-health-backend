// Auth routes — POST /api/auth/register, GET /api/auth/me, PUT /api/auth/settings
import { Router, Request, Response } from "express";
import { User } from "../models/User";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";
import admin, { initFirebaseAdmin } from "../firebaseAdmin";

initFirebaseAdmin();

const router = Router();

router.post(
  "/register",
  validate(schemas.authRegister),
  async (req: Request, res: Response) => {
    try {
      const { token, name, email } = req.body as {
        token?: string;
        name?: string;
        email?: string;
      };

      if (!token) {
        res.status(400).json({ success: false, error: "Missing Firebase token" });
        return;
      }

      let uid: string;
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        res.status(401).json({ success: false, error: "Invalid token" });
        return;
      }

      const userRecord = await admin.auth().getUser(uid).catch(() => null);
      const finalEmail = email || userRecord?.email || "";
      const displayName = name || userRecord?.displayName || "";

      const user = await User.findOneAndUpdate(
        { firebaseUid: uid },
        {
          $setOnInsert: { firebaseUid: uid },
          $set: {
            ...(displayName ? { name: displayName } : {}),
            ...(finalEmail ? { email: finalEmail } : {}),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.status(201).json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "Registration failed",
      });
    }
  }
);

router.get("/me", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const user = await User.findOne({ firebaseUid: uid });
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load user",
    });
  }
});

router.put("/settings", verifyToken, validate(schemas.authSettings), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { name } = req.body as { name?: string };
    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      { $set: { ...(name !== undefined ? { name } : {}) } },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to update settings",
    });
  }
});

export default router;
