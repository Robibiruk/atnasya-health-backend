// Cycle routes — full CRUD + /predict + /calendar/:year/:month + /stats
import { Router, Request, Response } from "express";
import { Cycle } from "../models/Cycle";
import { User } from "../models/User";
import { verifyToken } from "../middleware/auth";
import {
  predictNextCycle,
  getCurrentPhase,
  getDayOfCycle,
  regularityScore,
  detectFluctuation,
} from "../services/index";

const router = Router();
router.use(verifyToken);

// GET /api/cycles — all cycles for user, newest first.
router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const cycles = await Cycle.find({ userId: uid }).sort({ periodStart: -1 });
    res.json({ success: true, data: cycles });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load cycles",
    });
  }
});

// DELETE /api/cycles — delete all cycles for user (used by "Reset tracking data").
router.delete("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const r = await Cycle.deleteMany({ userId: uid });
    res.json({ success: true, data: { deleted: r.deletedCount } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete cycles",
    });
  }
});

// DELETE /api/cycles/:id — delete a single cycle and recalculate.
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const r = await Cycle.deleteOne({ _id: req.params.id, userId: uid });
    if (r.deletedCount === 0) {
      res.status(404).json({ success: false, error: "Cycle not found" });
      return;
    }
    await recalculateCycleLengths(uid);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to delete cycle",
      });
  }
});

// POST /api/cycles — log a new period start with overlap protection + fluctuation detection.
router.post("/", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { periodStart, periodEnd, notes } = req.body as {
      periodStart: string;
      periodEnd?: string;
      notes?: string;
    };
    if (!periodStart) {
      res
        .status(400)
        .json({ success: false, error: "periodStart is required" });
      return;
    }
    const newStart = new Date(periodStart);

    // 1. Auto-close the previous unclosed cycle
    //    If there's a cycle whose periodEnd is null and its periodStart is before newStart,
    //    set its periodEnd to newStart - 1 day (completing the cycle cleanly).
    const unclosedPrev = await Cycle.findOne({
      userId: uid,
      periodEnd: null,
      periodStart: { $lt: newStart },
    }).sort({ periodStart: -1 });

    if (unclosedPrev) {
      const prevEnd = new Date(newStart.getTime() - 86400000);
      unclosedPrev.periodEnd = prevEnd;
      await unclosedPrev.save();
    }

    // 2. Purge overlapping cycles using the user's actual cycle data
    //    Overlap window = max(21, min(35, userAvgCycleLength)) days, so it spans
    //    the physiological range (most people: 21–35 days) while respecting the
    //    user's actual rhythm.
    const userCycles = await Cycle.find({ userId: uid }).sort({ periodStart: -1 }).lean();
    const userLengths = userCycles
      .map((c) => c.cycleLength)
      .filter((l): l is number => typeof l === "number" && l >= 21 && l <= 45);
    const userAvg = userLengths.length > 0
      ? Math.round(userLengths.reduce((a, b) => a + b, 0) / userLengths.length)
      : 28;
    const overlapDays = Math.min(35, Math.max(21, userAvg));

    const overlapStart = new Date(newStart.getTime() - overlapDays * 86400000);
    const overlapEnd = new Date(newStart.getTime() + overlapDays * 86400000);

    await Cycle.deleteMany({
      userId: uid,
      periodStart: { $gte: overlapStart, $lte: overlapEnd },
    });

    // 3. Create a fresh cycle entry with the new data
    const last = await Cycle.findOne({ userId: uid }).sort({ periodStart: -1 });
    let cycleLength: number | null = null;
    if (last) {
      const rawDays = Math.round((newStart.getTime() - new Date(last.periodStart).getTime()) / 86400000);
      cycleLength = Math.min(45, Math.max(21, rawDays));
    }
    const cycle = await Cycle.create({
      userId: uid,
      periodStart: newStart,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      cycleLength,
      notes: notes ?? null,
    });

    // Detect fluctuation against prediction for the response
    const allCycles = await Cycle.find({ userId: uid }).sort({ periodStart: -1 }).lean();
    const cycleInputs = allCycles.map((c) => ({
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      cycleLength: c.cycleLength,
    }));
    const fluctuation = cycleInputs.length > 0
      ? detectFluctuation(cycleInputs.slice(0, 6), newStart)
      : { isFluctuation: false, predictedNextPeriod: null, diffDays: 0, isLate: false, isEarly: false };

    // 4. Recalculate all cycle lengths for consistency
    await recalculateCycleLengths(uid);

    // 5. Return cycle + fluctuation info
    res.status(201).json({
      success: true,
      data: cycle,
      fluctuation: fluctuation.isFluctuation
        ? {
            predictedNextPeriod: fluctuation.predictedNextPeriod,
            diffDays: fluctuation.diffDays,
            isLate: fluctuation.isLate,
            isEarly: fluctuation.isEarly,
            message: fluctuation.isLate
              ? `Your period arrived ${fluctuation.diffDays} days later than predicted`
              : `Your period arrived ${fluctuation.diffDays} days earlier than predicted`,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to log cycle",
    });
  }
});

// PUT /api/cycles/:id — update period start/end / notes.
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { periodStart, periodEnd, notes } = req.body as {
      periodStart?: string;
      periodEnd?: string;
      notes?: string;
    };
    const update: Record<string, unknown> = {};
    if (periodStart !== undefined) update.periodStart = new Date(periodStart);
    if (periodEnd !== undefined)
      update.periodEnd = periodEnd ? new Date(periodEnd) : null;
    if (notes !== undefined) update.notes = notes;
    const cycle = await Cycle.findOneAndUpdate(
      { _id: req.params.id, userId: uid },
      { $set: update },
      { new: true },
    );
    if (!cycle) {
      res.status(404).json({ success: false, error: "Cycle not found" });
      return;
    }
    // If periodStart was changed, purge nearby cycles and recalculate
    if (periodStart !== undefined) {
      const newStart = new Date(periodStart);
      // Use same user-aware overlap as POST
      const allCyclesForAvg = await Cycle.find({ userId: uid, _id: { $ne: cycle._id } }).sort({ periodStart: -1 }).lean();
      const lengths = allCyclesForAvg
        .map((c) => c.cycleLength)
        .filter((l): l is number => typeof l === "number" && l >= 21 && l <= 45);
      const avg = lengths.length > 0
        ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
        : 28;
      const overlapDays = Math.min(35, Math.max(21, avg));

      // Delete any other cycle that falls within the window (including the old one)
      await Cycle.deleteMany({
        userId: uid,
        _id: { $ne: cycle._id },
        periodStart: {
          $gte: new Date(newStart.getTime() - overlapDays * 86400000),
          $lte: new Date(newStart.getTime() + overlapDays * 86400000),
        },
      });

      // Recalculate cycleLength from previous cycle for accurate phase derivation
      const prev = await Cycle.findOne({
        userId: uid,
        _id: { $ne: cycle._id },
        periodStart: { $lt: newStart },
      }).sort({ periodStart: -1 });
      if (prev) {
        const rawDays = Math.round((newStart.getTime() - prev.periodStart.getTime()) / 86400000);
        cycle.cycleLength = Math.min(45, Math.max(21, rawDays));
        await cycle.save();
      }
    }
    // Recalculate all cycle lengths after edit
    await recalculateCycleLengths(uid);
    res.json({ success: true, data: cycle });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to update cycle",
    });
  }
});

// GET /api/cycles/predict — return next period + ovulation prediction.
router.get("/predict", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const cycles = await Cycle.find({ userId: uid }).sort({ periodStart: -1 });
    const today = new Date();

    // Read onboarding fallback data so 1-cycle users still get a prediction
    const user = await User.findOne({ firebaseUid: uid }).lean();
    const fallbackLength = user?.onboarding?.cycleLength ?? undefined;

    const cycleInputs = cycles.map((c) => ({
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      cycleLength: c.cycleLength,
    }));

    const prediction = predictNextCycle(cycleInputs, fallbackLength);
    const phase = getCurrentPhase(cycleInputs, today, fallbackLength);
    const lastStart = cycles[0]?.periodStart;
    const dayOfCycle = lastStart ? getDayOfCycle(lastStart, today) : null;
    res.json({
      success: true,
      data: {
        prediction,
        phase,
        dayOfCycle,
        regularity: regularityScore(cycleInputs),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Prediction failed",
    });
  }
});

// GET /api/cycles/stats — cycle statistics for the authenticated user.
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const cycles = await Cycle.find({ userId: uid }).sort({ periodStart: 1 }); // oldest first

    if (!cycles.length) {
      res.json({
        success: true,
        data: {
          avgCycleLength: null,
          avgPeriodDuration: null,
          daysLogged: 0,
          currentStreak: 0,
          trackingSince: null,
        },
      });
      return;
    }

    // avgCycleLength: mean of all valid cycleLength values (clamped to physiological range)
    const lengths = cycles
      .map((c) => c.cycleLength)
      .filter((l): l is number => typeof l === "number" && l > 0 && l >= 21 && l <= 45);
    const avgCycleLength =
      lengths.length > 0
        ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
        : null;

    // avgPeriodDuration: mean of cycles where periodEnd is set
    const durations = cycles
      .filter((c) => c.periodEnd)
      .map(
        (c) =>
          Math.round(
            (c.periodEnd!.getTime() - c.periodStart.getTime()) / 86_400_000,
          ) + 1,
      );
    const avgPeriodDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    // currentStreak: consecutive cycles logged (counts from most recent, breaks if gap > 60 days)
    let currentStreak = 0;
    for (let i = cycles.length - 1; i >= 0; i--) {
      if (i === cycles.length - 1) {
        currentStreak = 1;
        continue;
      }
      const gap =
        (cycles[i + 1].periodStart.getTime() -
          cycles[i].periodStart.getTime()) /
        86_400_000;
      if (gap <= 60) {
        currentStreak++;
      } else {
        break;
      }
    }

    // trackingSince: date of the oldest cycle
    const trackingSince = cycles[0].periodStart;

    res.json({
      success: true,
      data: {
        avgCycleLength,
        avgPeriodDuration,
        daysLogged: cycles.length,
        currentStreak,
        trackingSince,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to compute stats",
    });
  }
});

// GET /api/cycles/calendar/:year/:month — phase data for every day of a month.
router.get("/calendar/:year/:month", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const year = Number(req.params.year);
    const month = Number(req.params.month) - 1; // 0-indexed
    const cycles = await Cycle.find({ userId: uid }).sort({ periodStart: -1 });
    const cycleInputs = cycles.map((c) => ({
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      cycleLength: c.cycleLength,
    }));
    const prediction = predictNextCycle(cycleInputs);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
    const offset = (startOfMonth + 6) % 7; // convert to Mon-first

    const days: Array<{
      date: string;
      phase: ReturnType<typeof getCurrentPhase>;
    }> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({
        date: date.toISOString().slice(0, 10),
        phase: getCurrentPhase(cycleInputs, date),
      });
    }
    res.json({
      success: true,
      data: { year, month: month + 1, offset, days, prediction },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Calendar failed",
    });
  }
});

/**
 * Recalculate all cycleLength values for a user based on consecutive periodStart dates.
 * Call this after insert/update/delete to keep cycle data consistent.
 * Clamps to physiological range [21, 45] to prevent mistaken entries from corrupting averages.
 */
async function recalculateCycleLengths(uid: string | undefined): Promise<void> {
  if (!uid) return;
  const allCycles = await Cycle.find({ userId: uid })
    .sort({ periodStart: 1 })
    .lean();
  for (let i = 1; i < allCycles.length; i++) {
    const days = Math.round(
      (allCycles[i].periodStart.getTime() -
        allCycles[i - 1].periodStart.getTime()) /
        86400000,
    );
    // Clamp to physiological range: anything <21 or >45 is likely a mis-log
    const clampedDays = Math.min(45, Math.max(21, days));
    await Cycle.updateOne(
      { _id: allCycles[i]._id },
      { $set: { cycleLength: clampedDays } },
    );
  }
}

export default router;
