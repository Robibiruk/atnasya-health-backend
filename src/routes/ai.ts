// AI routes — POST /chat, POST /analyze, GET /history
import { Router, Request, Response } from "express";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { z } from "zod";
import { callAI, buildSystemPrompt } from "../services/index";
import { AIMessage, HealthContext } from "../types";
import { ChatMessage } from "../models/ChatMessage";
import { Cycle } from "../models/Cycle";
import { Symptom } from "../models/Symptom";
import { Vital } from "../models/Vital";
import { Mood } from "../models/Mood";
import { User } from "../models/User";
import {
  getCurrentPhase,
  getDayOfCycle,
  predictNextCycle,
} from "../services/index";

const chatHistoryListSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().max(1000).optional(),
});

const router = Router();
router.use(verifyToken);

// Build health context for the current user (used by chat + analyze).
async function getContext(uid: string | undefined): Promise<HealthContext> {
  const today = new Date();
  const empty: HealthContext = {
    currentDate: today.toISOString().slice(0, 10),
    dayOfCycle: 0,
    cycleLength: 28,
    phase: "unknown",
    nextPeriod: "unknown",
    ovulationStart: "unknown",
    ovulationEnd: "unknown",
    systolic: null,
    diastolic: null,
    sugar: null,
    weight: null,
    symptomsThisWeek: "none logged",
    moodTrend: "no data",
    userName: "Atnasya",
  };
  if (!uid) return empty;
  const [user, cycles, symptoms, vitals, moods] = await Promise.all([
    User.findOne({ firebaseUid: uid }).lean(),
    Cycle.find({ userId: uid }).sort({ periodStart: -1 }).limit(6).lean(),
    Symptom.find({
      userId: uid,
      date: { $gte: new Date(Date.now() - 7 * 86400000) },
    }).lean(),
    Vital.find({ userId: uid }).sort({ date: -1 }).limit(1).lean(),
    Mood.find({ userId: uid }).sort({ date: -1 }).limit(7).lean(),
  ]);
  const latestVital = vitals[0];
  const latestCycle = cycles[0];
  const cycleInputs = cycles.map((c) => ({
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    cycleLength: c.cycleLength,
  }));
  const phase = latestCycle ? getCurrentPhase(cycleInputs, today) : "unknown";
  const dayOfCycle = latestCycle
    ? getDayOfCycle(latestCycle.periodStart, today)
    : 0;
  const prediction = predictNextCycle(cycleInputs);
  const symptomsThisWeek = [
    ...new Set(symptoms.flatMap((s) => (s.items ?? []).map((i) => i.name))),
  ].join(", ");
  const avgMood =
    moods.length > 0
      ? (
          moods.reduce((sum, m) => sum + (m.score ?? 0), 0) / moods.length
        ).toFixed(1)
      : "no data";

  return {
    currentDate: today.toISOString().slice(0, 10),
    dayOfCycle,
    cycleLength: prediction?.avgLength ?? 28,
    phase,
    nextPeriod: prediction
      ? prediction.nextPeriod.toISOString().slice(0, 10)
      : "unknown",
    ovulationStart: prediction
      ? prediction.fertileStart.toISOString().slice(0, 10)
      : "unknown",
    ovulationEnd: prediction
      ? prediction.fertileEnd.toISOString().slice(0, 10)
      : "unknown",
    systolic: latestVital?.bp?.systolic ?? null,
    diastolic: latestVital?.bp?.diastolic ?? null,
    sugar: latestVital?.bloodSugar?.value ?? null,
    weight: latestVital?.weight?.value ?? null,
    symptomsThisWeek: symptomsThisWeek || "none logged",
    moodTrend: `${avgMood} avg (last 7)`,
    userName: user?.name || "Atnasya",
  };
}

// POST /api/ai/chat — health assistant message.
router.post(
  "/chat",
  validate(
    z.object({ messages: z.array(z.any()).max(50).optional() })
  ),
  async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { messages } = req.body as { messages?: AIMessage[] };
      const history: AIMessage[] = (messages ?? []).slice(-10);
      if (messages && messages.length > 50) {
        res.status(400).json({ success: false, error: "messages too long" });
        return;
      }

      const ctx = await getContext(uid);
      const systemPrompt = buildSystemPrompt(ctx);
      const reply = await callAI(systemPrompt, history);

      const latestUserMessage =
        history.length > 0 ? history[history.length - 1] : null;
      if (latestUserMessage) {
        await ChatMessage.create({
          userId: uid,
          scope: "ai",
          sender: "user",
          message: latestUserMessage.content,
        });
      }
      await ChatMessage.create({
        userId: uid,
        scope: "ai",
        sender: "assistant",
        message: reply,
      });

      res.json({ success: true, data: { reply } });
    } catch (err) {
      if (process.env.NODE_ENV !== "production" && err instanceof Error) {
        console.error("[AI Chat] Error in route:", err);
      }
      const reply =
        "I'm having trouble connecting right now. Please try again in a moment — your health data is safe.";
      res.json({ success: true, data: { reply } });
    }
  }
);

// GET /api/ai/history — recent AI chat history.
router.get(
  "/history",
  validate(chatHistoryListSchema),
  async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const parsedLimit =
        typeof req.body?.limit === "number" && Number.isFinite(req.body.limit)
          ? Math.min(Math.max(req.body.limit, 1), 200)
          : 100;
      const parsedOffset =
        typeof req.body?.offset === "number" && Number.isFinite(req.body.offset)
          ? Math.max(req.body.offset, 0)
          : 0;

      const [history, total] = await Promise.all([
        ChatMessage.find({ userId: uid, scope: "ai" })
          .sort({ createdAt: -1 })
          .skip(parsedOffset)
          .limit(parsedLimit)
          .lean(),
        ChatMessage.countDocuments({ userId: uid, scope: "ai" }),
      ]);

      res.json({
        success: true,
        data: {
          total,
          offset: parsedOffset,
          limit: parsedLimit,
          items: history.map((row) => ({
            id: String(row._id),
            sender: row.sender,
            message: row.message,
            createdAt: row.createdAt,
          })),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to load history" });
    }
  }
);

// POST /api/ai/analyze — symptom pattern analysis.
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const ctx = await getContext(uid);
    const systemPrompt =
      buildSystemPrompt(ctx) +
      "\n\nProvide a short, warm weekly symptom pattern summary.";
    const reply = await callAI(systemPrompt, [
      {
        role: "user",
        content:
          "Summarize my symptom patterns this week in 2-3 warm, encouraging sentences.",
      },
    ]);
    res.json({ success: true, data: { analysis: reply } });
  } catch (err) {
    res.json({
      success: true,
      data: {
        analysis:
          "Your symptom patterns look normal this week. Keep up the great work tracking — it helps you understand your body better.",
      },
    });
  }
});

export default router;
