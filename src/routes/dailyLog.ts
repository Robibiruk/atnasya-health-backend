// Daily log routes — CRUD for grouped daily log entries.
import { Router, Request, Response } from "express";
import { DailyLog } from "../models/DailyLog";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";

const router = Router();
router.use(verifyToken);

// GET /api/daily-logs — list daily logs, newest first.
router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const limit = Math.min(Number(req.query.limit) || 30, 365);
    const logs = await DailyLog.find({ userId: uid })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: logs.map((l) => ({ ...l, _id: l._id?.toString() })) });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load daily logs",
    });
  }
});

// GET /api/daily-logs/:date — single day log.
router.get("/:date", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date } = req.params;
    const doc = await DailyLog.findOne({ userId: uid, date }).lean();
    res.json({ success: true, data: doc ? { ...doc, _id: doc._id?.toString() } : null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load daily log",
    });
  }
});

// POST /api/daily-logs — create or upsert day summary.
router.post("/", validate(schemas.dailyLogCreate), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date, summary, details } = req.body as {
      date: string;
      summary?: string;
      details?: Record<string, unknown>;
    };

    const doc = await DailyLog.findOneAndUpdate(
      { userId: uid, date },
      { $set: { summary: summary ?? "", details: details ?? {} } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: { ...doc.toJSON(), _id: doc._id.toString() } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to save daily log",
    });
  }
});

// PATCH /api/daily-logs/:date — edit day summary/details.
router.patch("/:date", validate(schemas.dailyLogPatch), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date } = req.params;
    const { summary, details } = req.body as { summary?: string; details?: Record<string, unknown> };
    const doc = await DailyLog.findOneAndUpdate(
      { userId: uid, date },
      { $set: { ...(summary !== undefined ? { summary } : {}), ...(details !== undefined ? { details } : {}) } },
      { new: true }
    );
    if (!doc) {
      res.status(404).json({ success: false, error: "Daily log not found" });
      return;
    }
    res.json({ success: true, data: { ...doc.toJSON(), _id: doc._id.toString() } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to update daily log",
    });
  }
});

// DELETE /api/daily-logs/:date — remove day log.
router.delete("/:date", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date } = req.params;
    await DailyLog.findOneAndDelete({ userId: uid, date });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete daily log",
    });
  }
});

export default router;
