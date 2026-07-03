// Selfcare routes — CRUD + summary + stats
import { Router, Request, Response } from "express";
import { Selfcare } from "../models/Selfcare";
import { verifyToken } from "../middleware/auth";

const router = Router();
router.use(verifyToken);

// GET /api/selfcare — list entries newest first.
router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const limit = Math.min(Number(req.query.limit) || 90, 365);
    const entries = await Selfcare.find({ userId: uid }).sort({ date: -1 }).limit(limit).lean();
    const data = entries.map((e) => ({
      _id: e._id.toString(),
      userId: e.userId,
      date: e.date.toISOString().slice(0, 10),
      mood: e.mood,
      water: e.water,
      sleep: e.sleep,
      energy: e.energy,
      notes: e.notes,
      createdAt: e.createdAt.toISOString(),
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load self-care entries",
    });
  }
});

// GET /api/selfcare/summary — aggregated stats.
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const entries = await Selfcare.find({ userId: uid }).sort({ date: -1 }).limit(365).lean();

    const valid: Array<{ mood: number; water: number; sleep: number; energy: number }> = [];
    for (const e of entries) {
      if (e.mood != null && e.water != null && e.sleep != null && e.energy != null) {
        valid.push({ mood: e.mood, water: e.water, sleep: e.sleep, energy: e.energy });
      }
    }

    const totalEntries = entries.length;
    const avgMood = valid.length > 0 ? Number((valid.reduce((s, v) => s + v.mood, 0) / valid.length).toFixed(1)) : null;
    const avgWater = valid.length > 0 ? Number((valid.reduce((s, v) => s + v.water, 0) / valid.length).toFixed(1)) : null;
    const avgSleep = valid.length > 0 ? Number((valid.reduce((s, v) => s + v.sleep, 0) / valid.length).toFixed(1)) : null;
    const avgEnergy = valid.length > 0 ? Number((valid.reduce((s, v) => s + v.energy, 0) / valid.length).toFixed(1)) : null;

    // Streak: count consecutive days from most recent entry
    const sorted = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime());
    const calcStreak = (field: keyof typeof entries[0]): number => {
      let streak = 0;
      for (const e of sorted) {
        if (e[field] != null) streak++;
        else break;
      }
      return streak;
    };
    const moodStreak = calcStreak("mood");
    const waterStreak = calcStreak("water");
    const sleepStreak = calcStreak("sleep");

    res.json({
      success: true,
      data: { totalEntries, avgMood, avgWater, avgSleep, avgEnergy, moodStreak, waterStreak, sleepStreak },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load self-care summary",
    });
  }
});

// GET /api/selfcare/stats — detailed stats (streaks, averages).
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const entries = await Selfcare.find({ userId: uid }).sort({ date: -1 }).limit(365).lean();

    const totalEntries = entries.length;

    const streaks = { mood: 0, water: 0, sleep: 0 };
    for (const e of entries) {
      if (e.mood != null) streaks.mood++;
      else break;
    }
    for (const e of entries) {
      if (e.water != null) streaks.water++;
      else break;
    }
    for (const e of entries) {
      if (e.sleep != null) streaks.sleep++;
      else break;
    }

    const valid = entries.filter((e) => e.mood != null);
    const avgMood = valid.length > 0 ? valid.reduce((s, e) => s + (e.mood ?? 0), 0) / valid.length : null;

    res.json({
      success: true,
      data: { totalEntries, streaks: { mood: streaks.mood, water: streaks.water, sleep: streaks.sleep }, averages: { avgMood } },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load self-care stats",
    });
  }
});

// POST /api/selfcare — create or upsert a daily entry.
router.post("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date, mood, water, sleep, energy, notes } = req.body as {
      date: string;
      mood?: number;
      water?: number;
      sleep?: number;
      energy?: number;
      notes?: string;
    };

    if (!date) {
      res.status(400).json({ success: false, error: "date is required" });
      return;
    }

    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    const doc = await Selfcare.findOneAndUpdate(
      { userId: uid, date: day },
      {
        $set: {
          ...(mood !== undefined ? { mood } : {}),
          ...(water !== undefined ? { water } : {}),
          ...(sleep !== undefined ? { sleep } : {}),
          ...(energy !== undefined ? { energy } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
        $setOnInsert: { userId: uid, date: day },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      success: true,
      data: {
        _id: doc._id.toString(),
        userId: doc.userId,
        date: doc.date.toISOString().slice(0, 10),
        mood: doc.mood,
        water: doc.water,
        sleep: doc.sleep,
        energy: doc.energy,
        notes: doc.notes,
        createdAt: doc.createdAt.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to log self-care entry",
    });
  }
});

export default router;
