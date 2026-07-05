// Symptom routes — CRUD + /patterns
import { Router, Request, Response } from "express";
import { Symptom } from "../models/Symptom";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";
import { getCurrentPhase, predictNextCycle } from "../services/index";
import { Cycle } from "../models/Cycle";

const router = Router();
router.use(verifyToken);

router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    const symptoms = await Symptom.find({ userId: uid })
      .sort({ date: -1 })
      .limit(limit);
    res.json({ success: true, data: symptoms });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load symptoms",
    });
  }
});

router.post("/", validate(schemas.symptomCreate), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date, items } = req.body as {
      date: string;
      items: Array<{ name: string; intensity: number }>;
    };
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const latestCycle = await Cycle.findOne({ userId: uid }).sort({
      periodStart: -1,
    });
    const phase = latestCycle
      ? getCurrentPhase(
          [{ periodStart: latestCycle.periodStart, periodEnd: latestCycle.periodEnd, cycleLength: latestCycle.cycleLength }],
          new Date(date)
        )
      : "unknown";
    const doc = await Symptom.findOneAndUpdate(
      { userId: uid, date: day },
      { $set: { items, cyclePhase: phase } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to log symptoms",
    });
  }
});

// GET /api/symptoms/patterns — weekly pattern analysis.
router.get("/patterns", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const since = new Date(Date.now() - 7 * 86400000);
    const symptoms = await Symptom.find({
      userId: uid,
      date: { $gte: since },
    }).lean();
    const counts: Record<string, { count: number; totalIntensity: number }> = {};
    for (const s of symptoms) {
      for (const item of s.items ?? []) {
        if (!counts[item.name]) counts[item.name] = { count: 0, totalIntensity: 0 };
        counts[item.name].count += 1;
        counts[item.name].totalIntensity += item.intensity ?? 0;
      }
    }
    const patterns = Object.entries(counts)
      .map(([name, v]) => ({
        name,
        occurrences: v.count,
        avgIntensity: +(v.totalIntensity / v.count).toFixed(1),
      }))
      .sort((a, b) => b.occurrences - a.occurrences);
    res.json({ success: true, data: patterns });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Pattern analysis failed",
    });
  }
});

export default router;
