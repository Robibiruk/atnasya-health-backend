// Mood model — daily mood score + journal note.
import mongoose, { Schema, Model } from "mongoose";
import { MoodDoc } from "../types";

const MoodSchema = new Schema<MoodDoc>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    emoji: { type: String, default: "😐" },
    note: { type: String, default: null },
  },
  { timestamps: true }
);

MoodSchema.index({ userId: 1, date: -1 });

export const Mood: Model<MoodDoc> = mongoose.model<MoodDoc>("Mood", MoodSchema);
