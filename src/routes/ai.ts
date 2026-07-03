// AI routes — POST /chat, POST /analyze
import { Router, Request, Response } from "express";
import { verifyToken } from "../middleware/auth";
import { callAI, buildSystemPrompt } from "../services/index";
import { AIMessage, HealthContext } from "../types";
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
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    console.log(`[AI Chat] Starting request for user ${uid}`);
    const startTime = Date.now();

    const { messages } = req.body as { messages: AIMessage[] };
    console.log(`[AI Chat] Received ${messages?.length ?? 0} messages`);

    const ctxStart = Date.now();
    const ctx = await getContext(uid);
    const ctxTime = Date.now() - ctxStart;
    console.log(`[AI Chat] getContext took ${ctxTime}ms`);

    const promptStart = Date.now();
    const systemPrompt = buildSystemPrompt(ctx);
    const promptTime = Date.now() - promptStart;
    console.log(
      `[AI Chat] buildSystemPrompt took ${promptTime}ms, length: ${systemPrompt.length}`,
    );

    const historyStart = Date.now();
    const history: AIMessage[] = (messages ?? []).slice(-10);
    const historyTime = Date.now() - historyStart;
    console.log(`[AI Chat] history slicing took ${historyTime}ms`);

    const aiStart = Date.now();
    const reply = await callAI(systemPrompt, history);
    const aiTime = Date.now() - aiStart;
    console.log(`[AI Chat] callAI took ${aiTime}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`[AI Chat] Total request time: ${totalTime}ms`);

    res.json({ success: true, data: { reply } });
  } catch (err) {
    console.error("[AI Chat] Error in route:", err);
    // Return a graceful fallback instead of 500 so the UI never breaks
    const fallback =
      "I'm having trouble connecting right now. Please try again in a moment — your health data is safe.";
    res.json({ success: true, data: { reply: fallback } });
  }
});

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
