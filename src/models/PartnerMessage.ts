// PartnerMessage model — quick messages from partner to tracker.
import mongoose, { Schema, Model, Types } from "mongoose";

export interface PartnerMessageDoc {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  partnerId: Types.ObjectId;
  message: string;
  emoji: string;
  read: boolean;
  createdAt: Date;
}

const PartnerMessageSchema = new Schema<PartnerMessageDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    partnerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    emoji: { type: String, default: "💛" },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PartnerMessageSchema.index({ ownerId: 1, createdAt: -1 });

export const PartnerMessage: Model<PartnerMessageDoc> =
  mongoose.model<PartnerMessageDoc>("PartnerMessage", PartnerMessageSchema);
