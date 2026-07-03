// Selfcare model — daily mood/water/sleep/energy check-in.
import mongoose, { Schema, Model } from "mongoose";
import { SelfcareDoc } from "../types";

const SelfcareSchema = new Schema<SelfcareDoc>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    mood: { type: Number, default: null, min: 1, max: 5 },
    water: { type: Number, default: null },
    sleep: { type: Number, default: null },
    energy: { type: Number, default: null, min: 1, max: 5 },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

SelfcareSchema.index({ userId: 1, date: -1 });

export const Selfcare: Model<SelfcareDoc> = mongoose.model<SelfcareDoc>("Selfcare", SelfcareSchema);
