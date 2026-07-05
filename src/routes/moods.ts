// Mood routes — CRUD + /heatmap
import { Router, Request, Response } from "express";
import { Mood } from "../models/Mood";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";

const router = Router();
router.use(verifyToken);

router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    const moods = await Mood.find({ userId: uid }).sort({ date: -1 }).limit(limit);
    res.json({ success: true, data: moods });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load moods",
    });
  }
});

router.post("/", validate(schemas.moodCreate), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date, score, emoji, note } = req.body as {
      date: string;
      score: number;
      emoji?: string;
      note?: string;
    };
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const doc = await Mood.findOneAndUpdate(
      { userId: uid, date: day },
      {
        $set: {
          score,
          emoji: emoji ?? "😐",
          ...(note !== undefined ? { note } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to log mood",
    });
  }
});

// GET /api/moods/heatmap — 90-day heatmap data.
router.get("/heatmap", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const since = new Date(Date.now() - 90 * 86400000);
    const moods = await Mood.find({ userId: uid, date: { $gte: since } })
      .sort({ date: 1 })
      .lean();
    const cells = moods.map((m) => ({
      date: m.date.toISOString().slice(0, 10),
      score: m.score,
      emoji: m.emoji,
    }));
    res.json({ success: true, data: cells });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Heatmap failed",
    });
  }
});

export default router;
