// Symptom model — daily symptom logs with intensity (1-5 scale).
import mongoose, { Schema, Model } from "mongoose";
import { SymptomDoc } from "../types";

const SymptomSchema = new Schema<SymptomDoc>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    items: {
      type: [{ name: String, intensity: Number }],
      default: [],
    },
    cyclePhase: { type: String, default: "unknown" },
  },
  { timestamps: true }
);

SymptomSchema.index({ userId: 1, date: -1 });

export const Symptom: Model<SymptomDoc> = mongoose.model<SymptomDoc>(
  "Symptom",
  SymptomSchema
);
