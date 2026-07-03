// Cycle model — period logs, cycle lengths, ovulation dates.
import mongoose, { Schema, Model } from "mongoose";
import { CycleDoc } from "../types";

const CycleSchema = new Schema<CycleDoc>(
  {
    userId: { type: String, required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, default: null },
    cycleLength: { type: Number, default: null },
    ovulationDate: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

CycleSchema.index({ userId: 1, periodStart: -1 });

export const Cycle: Model<CycleDoc> = mongoose.model<CycleDoc>(
  "Cycle",
  CycleSchema
);
