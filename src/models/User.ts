// User model — profile, settings, theme, anonymous mode, onboarding.
import mongoose, { Schema, Model } from "mongoose";
import { UserDoc } from "../types";

const UserSchema = new Schema<UserDoc>(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "Atnasya" },
    email: { type: String, default: "" },
    settings: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      anonymousMode: { type: Boolean, default: false },
      notifications: { type: Boolean, default: true },
      unit: { type: String, enum: ["metric", "imperial"], default: "metric" },
    },
    onboardingCompleted: { type: Boolean, default: false },
    role: { type: String, enum: ["tracker", "partner"], default: "tracker" },
    goal: {
      type: String,
      enum: ["track", "conceive", "avoid", "wellness", "understand"],
      default: "track",
    },
    birthYear: { type: Number, default: null },
    onboarding: {
      periodLength: { type: Number, default: null },
      cycleLength: { type: Number, default: null },
      pregnant: { type: Boolean, default: null },
    },
    notificationPrefs: {
      periodReminders: { type: Boolean, default: true },
      ovulationAlerts: { type: Boolean, default: true },
      dailyLogReminder: { type: Boolean, default: false },
      periodReminder: { type: Boolean, default: true },
      dailyTip: { type: Boolean, default: true },
    },
    wishlist: [{ type: String }],
  },
  { timestamps: true }
);

export const User: Model<UserDoc> = mongoose.model<UserDoc>("User", UserSchema);
