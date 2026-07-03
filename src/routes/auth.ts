// Auth routes — POST /api/auth/register, GET /api/auth/me, PUT /api/auth/settings
import { Router, Request, Response } from "express";
import { User } from "../models/User";
import { verifyToken } from "../middleware/auth";
import admin, { initFirebaseAdmin } from "../firebaseAdmin";

initFirebaseAdmin();

const router = Router();

// Create/update user in MongoDB on first login.
// This endpoint is PUBLIC (no verifyToken) — it verifies the Firebase token
// from the request body instead, so new users can register without already
// having a backend session.
router.post("/register", async (req: Request, res: Response) => {
  try {
    // Verify the token from the request body (sent by frontend after Firebase auth)
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.token as string | undefined;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split("Bearer ")[1]
      : bodyToken;

    if (!token) {
      res.status(401).json({ success: false, error: "No token provided" });
      return;
    }

    // Dev bypass
    let uid: string;
    if (process.env.ATNASYA_DEV_AUTH === "1" && token.startsWith("dev:")) {
      uid = token.slice(4);
    } else {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        res.status(401).json({ success: false, error: "Invalid token" });
        return;
      }
    }

    const { name, email } = req.body as {
      name?: string;
      email?: string;
    };

    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      {
        $setOnInsert: { firebaseUid: uid },
        $set: {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Registration failed",
    });
  }
});

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

router.put("/settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const updates = req.body as Record<string, unknown>;
    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      { $set: updates },
      { new: true }
    );
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to update settings",
    });
  }
});

export default router;
