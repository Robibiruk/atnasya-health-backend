// Insight model — AI-generated daily insight cards (3/day).
import mongoose, { Schema, Model } from "mongoose";
import { InsightDoc } from "../types";

const InsightSchema = new Schema<InsightDoc>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    cards: {
      type: [
        {
          cardType: { type: String, enum: ["cycle", "vitals", "wellness"] },
          emoji: String,
          title: String,
          body: String,
          _id: false,
        },
      ],
      default: [],
    },
    liked: { type: [Number], default: [] },
  },
  { timestamps: true }
);

InsightSchema.index({ userId: 1, date: -1 });

export const Insight: Model<InsightDoc> = mongoose.model<InsightDoc>(
  "Insight",
  InsightSchema
);
