// PartnerConnection model — links an owner to a partner via invite code.
import mongoose, { Schema, Model, Types } from "mongoose";

export interface PartnerConnectionDoc {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  partnerId: Types.ObjectId | null;
  inviteCode: string;
  status: "pending" | "active" | "revoked";
  shareLevel: "phase_only" | "full_summary";
  shareMood: boolean;
  shareSymptoms: boolean;
  sharePregnancy: boolean;
  createdAt: Date;
  acceptedAt: Date | null;
}

const PartnerConnectionSchema = new Schema<PartnerConnectionDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    partnerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      length: 6,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "revoked"],
      default: "pending",
    },
    shareLevel: {
      type: String,
      enum: ["phase_only", "full_summary"],
      default: "phase_only",
    },
    shareMood: { type: Boolean, default: false },
    shareSymptoms: { type: Boolean, default: false },
    sharePregnancy: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PartnerConnection: Model<PartnerConnectionDoc> =
  mongoose.model<PartnerConnectionDoc>("PartnerConnection", PartnerConnectionSchema);
