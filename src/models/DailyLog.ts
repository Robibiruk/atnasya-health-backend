// DailyLog model — grouped daily summary of user logs.
import mongoose, { Schema, Model } from "mongoose";

export interface DailyLogDoc {
  userId: string;
  date: string; // YYYY-MM-DD
  summary: string;
  details: {
    symptoms?: Array<{ name: string; intensity: number }>;
    vitals?: Record<string, unknown>;
    mood?: { score: number; emoji?: string };
    lifestyle?: Record<string, unknown>;
    medications?: Array<{ name: string; dosage?: string; time?: string }>;
    photos?: Array<{ url: string; caption?: string }>;
    notes?: string;
  };
}

const DailyLogSchema = new Schema<DailyLogDoc>({
  userId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true },
  summary: { type: String, required: true, default: "" },
  details: { type: Schema.Types.Mixed, default: {} },
});

DailyLogSchema.index({ userId: 1, date: -1 });

export const DailyLog: Model<DailyLogDoc> =
  mongoose.model<DailyLogDoc>("DailyLog", DailyLogSchema);
