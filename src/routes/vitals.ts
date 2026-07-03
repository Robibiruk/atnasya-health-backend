// Vitals routes — CRUD + /trends
import { Router, Request, Response } from "express";
import { Vital } from "../models/Vital";
import { verifyToken } from "../middleware/auth";
import { getCurrentPhase } from "../services/index";
import { Cycle } from "../models/Cycle";

const router = Router();
router.use(verifyToken);

router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    const vitals = await Vital.find({ userId: uid })
      .sort({ date: -1 })
      .limit(limit);
    res.json({ success: true, data: vitals });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load vitals",
    });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { date, bp, bloodSugar, weight } = req.body as {
      date: string;
      bp?: { systolic: number; diastolic: number };
      bloodSugar?: { value: number; unit: string; timing: string };
      weight?: { value: number; unit: string };
    };
    if (!date) {
      res.status(400).json({ success: false, error: "date is required" });
      return;
    }
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
    const doc = await Vital.findOneAndUpdate(
      { userId: uid, date: day },
      {
        $set: {
          ...(bp ? { bp } : {}),
          ...(bloodSugar ? { bloodSugar } : {}),
          ...(weight ? { weight } : {}),
          cyclePhase: phase,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to log vitals",
    });
  }
});

// GET /api/vitals/trends?days=7|30
router.get("/trends", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const days = Number(req.query.days) || 7;
    const since = new Date(Date.now() - days * 86400000);
    const vitals = await Vital.find({ userId: uid, date: { $gte: since } })
      .sort({ date: 1 })
      .lean();
    const series = vitals.map((v) => ({
      date: v.date.toISOString().slice(0, 10),
      systolic: v.bp?.systolic ?? null,
      diastolic: v.bp?.diastolic ?? null,
      sugar: v.bloodSugar?.value ?? null,
      weight: v.weight?.value ?? null,
      phase: v.cyclePhase,
    }));
    res.json({ success: true, data: series });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Trends failed",
    });
  }
});

export default router;
