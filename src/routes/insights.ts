// Insight routes — GET /today, POST /generate
import { Router, Request, Response } from "express";
import { Insight } from "../models/Insight";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";
import { runDailyInsights } from "../services/index";

const router = Router();
router.use(verifyToken);

router.get("/today", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let insight = await Insight.findOne({
      userId: uid,
      date: { $gte: today },
    });
    if (!insight) {
      await runDailyInsights();
      insight = await Insight.findOne({
        userId: uid,
        date: { $gte: today },
      });
    }
    res.json({ success: true, data: insight ?? null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load insights",
    });
  }
});

router.post("/generate", validate(schemas.insightGenerate), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    await runDailyInsights();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const insight = await Insight.findOne({
      userId: uid,
      date: { $gte: today },
    });
    res.json({ success: true, data: insight ?? null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Generation failed",
    });
  }
});

export default router;
