// PartnerWishlist model — shared wishlist linked to a connection.
import mongoose, { Schema, Model } from "mongoose";

export interface PartnerWishlistDoc {
  ownerId: mongoose.Types.ObjectId;
  partnerId: mongoose.Types.ObjectId;
  connectionId?: string;
  items: string[];
}

const PartnerWishlistSchema = new Schema<PartnerWishlistDoc>({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  connectionId: { type: String, required: false },
  items: { type: [String], default: [] },
});

export const PartnerWishlist: Model<PartnerWishlistDoc> =
  mongoose.model<PartnerWishlistDoc>("PartnerWishlist", PartnerWishlistSchema);
