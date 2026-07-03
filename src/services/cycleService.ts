// Cycle prediction algorithm — the core engine of Atnasya Health.
// Mirrors the client-side cycleUtils.ts so server and client agree.
//
// Algorithm (from cycle-service.md):
//   avgCycleLength = weighted median of last 3+ cycle lengths (outlier-resistant)
//   nextPeriod     = lastPeriodStart + avgCycleLength
//   ovulationDay   = nextPeriod - 14
//   fertileWindow  = [ovulationDay - 5, ovulationDay + 1]
//
// Fluctuation detection:
//   When a period is logged, the actual start date is compared to the predicted
//   next period. If off by >3 days, a "fluctuation" flag is returned.
import { CyclePhase, CyclePrediction } from "../types";

export interface CycleInput {
  periodStart: Date | string;
  periodEnd?: Date | string | null;
  cycleLength?: number | null;
}

export interface FluctuationInfo {
  predictedNextPeriod: string | null;
  actualLoggedDate: string;
  diffDays: number;
  isLate: boolean;
  isEarly: boolean;
  isFluctuation: boolean;
}

const MS_PER_DAY = 86_400_000;
const MIN_CYCLE = 21;
const MAX_CYCLE = 45;

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** Day of cycle: 1-indexed day since the most recent period start. */
export function getDayOfCycle(lastPeriodStart: Date | string, today: Date): number {
  const start = toDate(lastPeriodStart);
  return Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

/**
 * Weighted median: more recent cycles count more.
 * Resistant to single outlier cycles (e.g. 45d in a sea of 28-30d).
 */
function weightedMedianLength(lengths: number[]): number {
  if (lengths.length === 0) return 28;
  if (lengths.length === 1) return lengths[0];

  // Sort ascending, assign higher weights to more recent entries
  // (the input array is newest-first, so we reverse for chronological)
  const sorted = [...lengths].reverse();
  const weights = sorted.map((_, i) => i + 1); // linear weight: oldest=1, newest=N
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Build weighted array
  const weighted: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const copies = Math.round((weights[i] / totalWeight) * 100);
    for (let j = 0; j < copies; j++) {
      weighted.push(sorted[i]);
    }
  }

  weighted.sort((a, b) => a - b);
  const mid = Math.floor(weighted.length / 2);
  const median = weighted.length % 2 === 0
    ? Math.round((weighted[mid - 1] + weighted[mid]) / 2)
    : weighted[mid];

  // Clamp to physiological range
  return Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, median));
}

/**
 * Predict next period, ovulation day, and fertile window.
 * Uses weighted median averaging for outlier resistance.
 */
export function predictNextCycle(
  cycles: CycleInput[],
  fallbackLength?: number
): CyclePrediction | null {
  if (!cycles.length) return null;

  // Extract cycle lengths: prefer stored cycleLength, derive from dates otherwise
  const lengths: number[] = [];
  const sorted = [...cycles]
    .map((c) => ({ start: toDate(c.periodStart).getTime(), len: c.cycleLength }))
    .sort((a, b) => b.start - a.start); // newest first

  for (const c of sorted) {
    if (c.len && c.len >= MIN_CYCLE && c.len <= MAX_CYCLE) {
      lengths.push(c.len);
    }
  }

  // If no valid stored lengths, derive from consecutive periodStart dates
  if (lengths.length === 0 && cycles.length >= 2) {
    const sortedStarts = [...cycles]
      .map((c) => toDate(c.periodStart).getTime())
      .sort((a, b) => b - a);

    for (let i = 0; i < sortedStarts.length - 1; i++) {
      const diff = Math.round((sortedStarts[i] - sortedStarts[i + 1]) / MS_PER_DAY);
      if (diff >= MIN_CYCLE && diff <= MAX_CYCLE) {
        lengths.push(diff);
      }
    }
  }

  // Fallback: use onboarding fallback
  if (lengths.length === 0 && fallbackLength && fallbackLength > 0) {
    lengths.push(fallbackLength);
  }

  // Absolute fallback: 28 days
  if (lengths.length === 0) {
    // Even with a single cycle start, use a reasonable default
    if (cycles.length === 1) {
      // For first cycle, use 28 days as default
      return {
        nextPeriod: new Date(toDate(cycles[0].periodStart).getTime() + 28 * MS_PER_DAY),
        ovulationDay: new Date(toDate(cycles[0].periodStart).getTime() + 14 * MS_PER_DAY),
        fertileStart: new Date(toDate(cycles[0].periodStart).getTime() + 9 * MS_PER_DAY),
        fertileEnd: new Date(toDate(cycles[0].periodStart).getTime() + 15 * MS_PER_DAY),
        avgLength: 28,
      };
    }
    return null;
  }

  const avgLength = weightedMedianLength(lengths);
  const lastStart = toDate(cycles[0].periodStart);
  const nextPeriod = new Date(lastStart.getTime() + avgLength * MS_PER_DAY);
  const ovulationDay = new Date(nextPeriod.getTime() - 14 * MS_PER_DAY);
  const fertileStart = new Date(ovulationDay.getTime() - 5 * MS_PER_DAY);
  const fertileEnd = new Date(ovulationDay.getTime() + 1 * MS_PER_DAY);

  return { nextPeriod, ovulationDay, fertileStart, fertileEnd, avgLength };
}

/**
 * Detect fluctuations: compare actual logged period date against predicted.
 */
export function detectFluctuation(
  cycles: CycleInput[],
  newPeriodStart: Date,
  fallbackLength?: number
): FluctuationInfo {
  const prediction = predictNextCycle(cycles, fallbackLength);
  const result: FluctuationInfo = {
    predictedNextPeriod: null,
    actualLoggedDate: newPeriodStart.toISOString().slice(0, 10),
    diffDays: 0,
    isLate: false,
    isEarly: false,
    isFluctuation: false,
  };

  if (!prediction) return result;

  const predicted = prediction.nextPeriod;
  result.predictedNextPeriod = predicted.toISOString().slice(0, 10);
  const diff = Math.round((newPeriodStart.getTime() - predicted.getTime()) / MS_PER_DAY);
  result.diffDays = Math.abs(diff);
  result.isLate = diff > 0;
  result.isEarly = diff < 0;
  result.isFluctuation = Math.abs(diff) > 3;

  return result;
}

/** Determine current cycle phase for a given day. */
export function getCurrentPhase(
  cycles: CycleInput[],
  today: Date,
  fallbackLength?: number
): CyclePhase {
  if (!cycles.length) return "unknown";

  const sorted = [...cycles].sort(
    (a, b) => toDate(b.periodStart).getTime() - toDate(a.periodStart).getTime()
  );
  const last = sorted[0];
  const lastStart = toDate(last.periodStart);
  const lastEnd = last.periodEnd ? toDate(last.periodEnd) : null;
  const dayOfCycle = getDayOfCycle(lastStart, today);

  // Inside the bleeding window.
  if (lastEnd && today <= lastEnd && today >= lastStart) return "menstrual";

  const prediction = predictNextCycle(sorted, fallbackLength);
  if (!prediction) return "follicular";

  const todayStr = today.toDateString();
  if (todayStr === prediction.ovulationDay.toDateString()) return "ovulation";
  if (today >= prediction.fertileStart && today <= prediction.fertileEnd)
    return "fertile";
  // Luteal = the last ~7 days before the next predicted period.
  if (dayOfCycle > prediction.avgLength - 7) return "luteal";
  return "follicular";
}

/** Simple regularity score: 0-100 based on variance of cycle lengths. */
export function regularityScore(cycles: CycleInput[]): number | null {
  const lengths = cycles
    .map((c) => c.cycleLength)
    .filter((l): l is number => typeof l === "number" && l > 0 && l >= MIN_CYCLE && l <= MAX_CYCLE);
  if (lengths.length < 2) return null;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stddev = Math.sqrt(variance);
  return Math.max(0, Math.round(100 - stddev * 14));
}
