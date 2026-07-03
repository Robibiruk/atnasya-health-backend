// ChatMessage model — secret chat / private journal / partner messages.
import mongoose, { Schema, Model } from "mongoose";
import { ChatMessageDoc } from "../types";

const ChatMessageSchema = new Schema<ChatMessageDoc>(
  {
    userId: { type: String, required: true, index: true },
    sender: {
      type: String,
      enum: ["user", "assistant", "partner"],
      required: true,
    },
    message: { type: String, required: true },
    encrypted: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ChatMessageSchema.index({ userId: 1, createdAt: -1 });

export const ChatMessage: Model<ChatMessageDoc> =
  mongoose.model<ChatMessageDoc>("ChatMessage", ChatMessageSchema);
