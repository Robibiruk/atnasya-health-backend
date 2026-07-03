// Daily insight cron — runs at 6:00 AM, generates 3 insight cards per active user.
// NEVER stores raw AI text — always parses to typed cards before upsert.
/// <reference path="../node-cron.d.ts" />
import cron from "node-cron";
import { User } from "../models/User";
import { Cycle } from "../models/Cycle";
import { Symptom } from "../models/Symptom";
import { Vital } from "../models/Vital";
import { Mood } from "../models/Mood";
import { Insight } from "../models/Insight";
import { HealthContext } from "../types";
import {
  buildSystemPrompt,
  generateInsightCards,
  getCurrentPhase,
  getDayOfCycle,
  predictNextCycle,
} from "./index";

/** Build a health context snapshot for a single user from their latest data. */
async function buildHealthContext(
  userId: string,
  userName: string
): Promise<HealthContext> {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const [cycles, symptoms, vitals, moods] = await Promise.all([
    Cycle.find({ userId }).sort({ periodStart: -1 }).limit(6).lean(),
    Symptom.find({ userId, date: { $gte: new Date(Date.now() - 7 * 86400000) } })
      .sort({ date: -1 })
      .lean(),
    Vital.find({ userId }).sort({ date: -1 }).limit(1).lean(),
    Mood.find({ userId }).sort({ date: -1 }).limit(7).lean(),
  ]);

  const latestVital = vitals[0];
  const latestCycle = cycles[0];

  const phase = latestCycle
    ? getCurrentPhase(
        cycles.map((c) => ({
          periodStart: c.periodStart,
          periodEnd: c.periodEnd,
          cycleLength: c.cycleLength,
        })),
        today
      )
    : "unknown";

  const dayOfCycle = latestCycle
    ? getDayOfCycle(latestCycle.periodStart, today)
    : 0;

  const prediction = predictNextCycle(
    cycles.map((c) => ({
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      cycleLength: c.cycleLength,
    }))
  );

  const symptomsThisWeek = [
    ...new Set(
      symptoms.flatMap((s) => (s.items ?? []).map((i) => i.name))
    ),
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
    userName,
  };
}

/** Generate and upsert today's insight cards for one user. */
async function generateForUser(userId: string, userName: string): Promise<void> {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const ctx = await buildHealthContext(userId, userName);
  const systemPrompt = buildSystemPrompt(ctx);
  const cards = await generateInsightCards(systemPrompt);

  await Insight.updateOne(
    { userId, date: { $gte: startOfDay } },
    {
      $set: { cards, updatedAt: new Date() },
      $setOnInsert: { userId, date: startOfDay, liked: [] },
    },
    { upsert: true }
  );
}

/** The daily job — iterates all active users and generates their cards. */
export async function runDailyInsights(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[cron] Generating daily insights…");
  const users = await User.find({}).lean();
  for (const u of users) {
    try {
      await generateForUser(u.firebaseUid, u.name || "Atnasya");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[cron] insight failed for ${u.firebaseUid}:`, err);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[cron] Insights generated for ${users.length} users.`);
}

/** Schedule the 6:00 AM daily job. */
export function startInsightCron(): void {
  // Every day at 06:00 server time.
  cron.schedule("0 6 * * *", () => {
    runDailyInsights().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[cron] daily insight job failed:", err);
    });
  });
  // eslint-disable-next-line no-console
  console.log("[cron] Daily insight job scheduled for 06:00.");
}
