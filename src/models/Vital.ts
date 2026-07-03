// Vital model — BP, blood sugar, weight per day.
import mongoose, { Schema, Model } from "mongoose";
import { VitalDoc } from "../types";

const VitalSchema = new Schema<VitalDoc>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    bp: {
      systolic: Number,
      diastolic: Number,
      _id: false,
    },
    bloodSugar: {
      value: Number,
      unit: { type: String, enum: ["mg/dL", "mmol/L"] },
      timing: { type: String, enum: ["fasting", "post-meal"] },
      _id: false,
    },
    weight: {
      value: Number,
      unit: { type: String, enum: ["kg", "lbs"] },
      _id: false,
    },
    cyclePhase: { type: String, default: "unknown" },
  },
  { timestamps: true }
);

VitalSchema.index({ userId: 1, date: -1 });

export const Vital: Model<VitalDoc> = mongoose.model<VitalDoc>(
  "Vital",
  VitalSchema
);
