// cyclePredict.test.ts — unit tests for the cycle prediction algorithm.
// Run with: npm test (or ts-node src/tests/cyclePredict.test.ts)
import {
  predictNextCycle,
  getCurrentPhase,
  getDayOfCycle,
} from "../services/cycleService";

let passed = 0;
let failed = 0;

function assert(name: string, condition: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${name}`);
  }
}

function day(n: number): Date {
  // Anchor date: 2026-01-01 + n days. Deterministic, no Date.now().
  return new Date(Date.UTC(2026, 0, 1 + n));
}

export function run(): void {
  console.log("cyclePredict.test");

  // 1. Cycle without a length → returns null (no usable data)
  assert(
    "Cycle without a length → returns null",
    predictNextCycle([{ periodStart: day(0) }]) === null
  );

  // 2. 3 cycles of 28 days → predicts next period correctly
  const three28 = [
    { periodStart: day(84), cycleLength: 28 },
    { periodStart: day(56), cycleLength: 28 },
    { periodStart: day(28), cycleLength: 28 },
  ];
  const pred28 = predictNextCycle(three28);
  assert("3×28 → avgLength is 28", pred28?.avgLength === 28);
  assert(
    "3×28 → nextPeriod is 28 days after last start",
    pred28?.nextPeriod.toISOString().slice(0, 10) ===
      day(112).toISOString().slice(0, 10)
  );
  assert(
    "3×28 → ovulationDay is 14 days before next period",
    pred28?.ovulationDay.toISOString().slice(0, 10) ===
      day(98).toISOString().slice(0, 10)
  );

  // 3. Irregular cycles (25, 30, 27) → averages to 27
  const irregular = [
    { periodStart: day(82), cycleLength: 27 },
    { periodStart: day(52), cycleLength: 30 },
    { periodStart: day(27), cycleLength: 25 },
  ];
  const predIrr = predictNextCycle(irregular);
  assert("Irregular (25,30,27) → avgLength is 27", predIrr?.avgLength === 27);

  // 4. getCurrentPhase with today in period → returns "menstrual"
  const inPeriod = [
    {
      periodStart: day(10),
      periodEnd: day(14),
      cycleLength: 28,
    },
  ];
  assert(
    "Today in period → menstrual",
    getCurrentPhase(inPeriod, day(12)) === "menstrual"
  );

  // 5. getCurrentPhase with today 5 days before ovulation → returns "fertile"
  //    Requires ≥2 cycles for ovulation prediction. With cycle starts at day 10
  //    and day 38 (28-day cycle), nextPeriod = day 66, ovulation = day 52,
  //    fertile window = [day 47, day 53].
  const fertileCase = [
    { periodStart: day(38), cycleLength: 28 },
    { periodStart: day(10), cycleLength: 28 },
  ];
  assert(
    "Today 5 days before ovulation → fertile",
    getCurrentPhase(fertileCase, day(47)) === "fertile"
  );

  // 6. getDayOfCycle returns 1-indexed day
  assert("getDayOfCycle day 0 → 1", getDayOfCycle(day(10), day(10)) === 1);
  assert("getDayOfCycle day 13 → 14", getDayOfCycle(day(10), day(23)) === 14);

  // 7. No cycles → unknown
  assert("No cycles → unknown", getCurrentPhase([], day(10)) === "unknown");

  console.log(`\ncyclePredict: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

// Allow direct run.
if (require.main === module) run();
