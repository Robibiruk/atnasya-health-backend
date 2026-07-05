// Partner routes — invite, accept, view, settings, revoke.
import { Router, Request, Response } from "express";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";
import { User } from "../models/User";
import type { UserDoc } from "../types";
import { PartnerConnection } from "../models/PartnerConnection";
import { PartnerMessage } from "../models/PartnerMessage";
import { Cycle } from "../models/Cycle";
import { Mood } from "../models/Mood";
import { PartnerWishlist } from "../models/PartnerWishlist";
import {
  predictNextCycle,
  getCurrentPhase,
  getDayOfCycle,
} from "../services/index";
import { generateInviteCode, generateEmpathyTip } from "../services/partnerService";

const router = Router();

// POST /api/partner/invite — owner generates an invite code
router.post("/invite", verifyToken, validate(schemas.partnerInvite), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const owner = await User.findOne({ firebaseUid: uid });
    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Check for existing active/pending connection
    const existing = await PartnerConnection.findOne({
      ownerId: owner._id,
      status: { $in: ["pending", "active"] },
    });

    if (existing) {
      res.json({
        success: true,
        data: {
          inviteCode: existing.inviteCode,
          status: existing.status,
          shareLevel: existing.shareLevel,
          shareMood: existing.shareMood,
          createdAt: existing.createdAt,
        },
      });
      return;
    }

    // Generate new invite
    const inviteCode = generateInviteCode();
    const connection = await PartnerConnection.create({
      ownerId: owner._id,
      inviteCode,
      status: "pending",
    });

    res.json({
      success: true,
      data: {
        inviteCode: connection.inviteCode,
        status: connection.status,
        shareLevel: connection.shareLevel,
        shareMood: connection.shareMood,
        shareSymptoms: connection.shareSymptoms,
        sharePregnancy: connection.sharePregnancy,
        createdAt: connection.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to create invite",
    });
  }
});

// POST /api/partner/accept — partner accepts an invite
router.post("/accept", verifyToken, validate(schemas.partnerAccept), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { inviteCode } = req.body as { inviteCode?: string };

    if (!inviteCode || inviteCode.length !== 6) {
      res.status(400).json({ success: false, error: "Invalid code" });
      return;
    }

    const partner = await User.findOne({ firebaseUid: uid });
    if (!partner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      inviteCode: inviteCode.toUpperCase(),
      status: "pending",
    });

    if (!connection) {
      res.status(404).json({ success: false, error: "Invalid code" });
      return;
    }

    // Guard: cannot accept own code (compare both MongoDB _id and Firebase UID)
    const owner = await User.findById(connection.ownerId).lean();
    if (
      connection.ownerId.toString() === partner._id.toString() ||
      (owner?.firebaseUid && owner.firebaseUid === uid)
    ) {
      res.status(400).json({ success: false, error: "Cannot accept your own invite" });
      return;
    }

    // Guard: partner cannot already be connected
    const existingPartner = await PartnerConnection.findOne({
      partnerId: partner._id,
      status: "active",
    });
    if (existingPartner) {
      res.status(400).json({ success: false, error: "Already connected" });
      return;
    }

    // Activate connection
    connection.partnerId = partner._id;
    connection.status = "active";
    connection.acceptedAt = new Date();
    await connection.save();

    const ownerDoc = await User.findById(connection.ownerId).lean();

    res.json({
      success: true,
      data: {
        ownerName: ownerDoc?.name ?? "Your partner",
        status: "active",
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to accept invite",
    });
  }
});

// GET /api/partner/my-connection — owner checks their connection status
router.get("/my-connection", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const owner = await User.findOne({ firebaseUid: uid });
    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      ownerId: owner._id,
    }).sort({ createdAt: -1 });

    if (!connection || connection.status === "revoked") {
      res.json({ success: true, data: { status: "none" } });
      return;
    }

    let partnerName: string | null = null;
    if (connection.partnerId) {
      const partner = await User.findById(connection.partnerId).lean();
      partnerName = partner?.name ?? null;
    }

    res.json({
      success: true,
      data: {
        status: connection.status,
        inviteCode: connection.inviteCode,
        partnerName,
        shareLevel: connection.shareLevel,
        shareMood: connection.shareMood,
        shareSymptoms: connection.shareSymptoms,
        sharePregnancy: connection.sharePregnancy,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load connection",
    });
  }
});

// GET /api/partner/view — partner views owner's shared cycle data
router.get("/view", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const partner = await User.findOne({ firebaseUid: uid });
    if (!partner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      partnerId: partner._id,
      status: "active",
    });

    if (!connection) {
      // Check if there was a connection that was revoked (partner got disconnected)
      const revokedConn = await PartnerConnection.findOne({
        partnerId: partner._id,
        status: "revoked",
      }).sort({ createdAt: -1 });

      if (revokedConn) {
        res.json({ success: true, data: { disconnected: true, reason: "revoked" } });
        return;
      }

      res.status(404).json({ success: false, error: "No active connection" });
      return;
    }

    const owner = await User.findById(connection.ownerId).lean();
    if (!owner) {
      res.status(404).json({ success: false, error: "Owner not found" });
      return;
    }

    // Resolve owner's cycle data using owner's firebaseUid
    const ownerUid = owner.firebaseUid;
    const cycles = await Cycle.find({ userId: ownerUid }).sort({ periodStart: -1 }).lean();
    const today = new Date();

    const cycleInputs = cycles.map((c) => ({
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      cycleLength: c.cycleLength,
    }));

    // Use onboarding fallback for prediction
    const fallbackLength = owner.onboarding?.cycleLength ?? undefined;
    const prediction = predictNextCycle(cycleInputs, fallbackLength);
    const phase = getCurrentPhase(cycleInputs, today, fallbackLength);
    const lastStart = cycles[0]?.periodStart;
    const dayOfCycle = lastStart ? getDayOfCycle(lastStart, today) : 0;

    const daysUntilPeriod = prediction
      ? Math.max(0, Math.ceil((new Date(prediction.nextPeriod).getTime() - today.getTime()) / 86_400_000))
      : 0;

    // Compute daysIntoPeriod if currently on period
    let daysIntoPeriod: number | null = null;
    if (phase === "menstrual" && lastStart) {
      daysIntoPeriod = getDayOfCycle(lastStart, today);
    }

    // Build next events (max 2)
    const nextEvents: Array<{ name: string; daysUntil: number }> = [];
    if (connection.shareLevel === "full_summary" && prediction) {
      const fertileDays = Math.ceil((new Date(prediction.fertileStart).getTime() - today.getTime()) / 86_400_000);
      const ovulationDays = Math.ceil((new Date(prediction.ovulationDay).getTime() - today.getTime()) / 86_400_000);
      if (fertileDays > 0) nextEvents.push({ name: "Fertile window", daysUntil: fertileDays });
      if (ovulationDays > 0) nextEvents.push({ name: "Ovulation", daysUntil: ovulationDays });
    }
    if (daysUntilPeriod > 0) {
      nextEvents.push({ name: "Period", daysUntil: daysUntilPeriod });
    }

    // Mood summary (only if shareMood)
    let moodSummary: string | null = null;
    if (connection.shareMood) {
      const latestMood = await Mood.findOne({ userId: ownerUid }).sort({ date: -1 }).lean();
      if (latestMood) {
        moodSummary = latestMood.emoji
          ? `${latestMood.emoji} Feeling ${["rough", "low", "okay", "good", "great"][latestMood.score - 1] ?? "okay"}`
          : null;
      }
    }

    // Generate empathy tip (never null — fallback built into service)
    const empathyTip = await generateEmpathyTip(phase.replace("_", " "), dayOfCycle, daysUntilPeriod);

    res.json({
      success: true,
      data: {
        ownerFirstName: owner.name?.split(" ")[0] ?? "Your partner",
        currentPhase: phase,
        dayOfCycle,
        daysIntoPeriod,
        daysUntilPeriod,
        avgLength: prediction?.avgLength ?? (owner.onboarding?.cycleLength ?? 28),
        nextEvents: nextEvents.slice(0, 2),
        moodSummary,
        empathyTip,
        shareLevel: connection.shareLevel,
        shareMood: connection.shareMood,
        shareSymptoms: connection.shareSymptoms,
        sharePregnancy: connection.sharePregnancy,
        acceptedAt: connection.acceptedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load partner view",
    });
  }
});

// PATCH /api/partner/settings — owner updates share settings
router.patch("/settings", verifyToken, validate(schemas.partnerSettings), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { shareLevel, shareMood, shareSymptoms, sharePregnancy } = req.body as {
      shareLevel?: "phase_only" | "full_summary";
      shareMood?: boolean;
      shareSymptoms?: boolean;
      sharePregnancy?: boolean;
    };

    const owner = await User.findOne({ firebaseUid: uid });
    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      ownerId: owner._id,
      status: "active",
    });

    if (!connection) {
      res.status(404).json({ success: false, error: "No active connection" });
      return;
    }

    if (shareLevel) connection.shareLevel = shareLevel;
    if (typeof shareMood === "boolean") connection.shareMood = shareMood;
    if (typeof shareSymptoms === "boolean") connection.shareSymptoms = shareSymptoms;
    if (typeof sharePregnancy === "boolean") connection.sharePregnancy = sharePregnancy;
    await connection.save();

    // Return full connection data so frontend state stays intact
    let partnerName: string | null = null;
    if (connection.partnerId) {
      const partner = await User.findById(connection.partnerId).lean();
      partnerName = partner?.name ?? null;
    }

    res.json({
      success: true,
      data: {
        status: connection.status,
        inviteCode: connection.inviteCode,
        partnerName,
        shareLevel: connection.shareLevel,
        shareMood: connection.shareMood,
        shareSymptoms: connection.shareSymptoms,
        sharePregnancy: connection.sharePregnancy,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to update settings",
    });
  }
});

// DELETE /api/partner/revoke — owner revokes/disconnects (fix: use connection _id, keep partnerId for partner-side detection)
router.delete("/revoke", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const owner = await User.findOne({ firebaseUid: uid });
    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Find the active/pending connection and set status to revoked
    // Keep partnerId so the partner's /view can return a "disconnected" signal
    const connection = await PartnerConnection.findOneAndUpdate(
      { ownerId: owner._id, status: { $in: ["pending", "active"] } },
      { $set: { status: "revoked" } },
      { sort: { createdAt: -1 } }
    );

    if (!connection) {
      res.status(404).json({ success: false, error: "No active connection found" });
      return;
    }

    res.json({ success: true, data: { success: true } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to revoke connection",
    });
  }
});

// POST /api/partner/message — partner sends a quick message to the owner
router.post("/message", verifyToken, validate(schemas.partnerMessage), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const partner = await User.findOne({ firebaseUid: uid });
    if (!partner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      partnerId: partner._id,
      status: "active",
    });

    if (!connection) {
      res.status(404).json({ success: false, error: "No active connection" });
      return;
    }

    const { message, emoji } = req.body as { message: string; emoji?: string };
    if (!message) {
      res.status(400).json({ success: false, error: "Message is required" });
      return;
    }

    const doc = await PartnerMessage.create({
      ownerId: connection.ownerId,
      partnerId: partner._id,
      message,
      emoji: emoji ?? "💛",
    });

    res.status(201).json({ success: true, data: { id: doc._id, message, emoji: doc.emoji, createdAt: doc.createdAt } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message",
    });
  }
});

// GET /api/partner/messages — owner fetches unread messages from partner
router.get("/messages", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const owner = await User.findOne({ firebaseUid: uid });
    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const messages = await PartnerMessage.find({ ownerId: owner._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const data = messages.map((m) => ({
      id: m._id,
      message: m.message,
      emoji: m.emoji,
      read: m.read,
      createdAt: m.createdAt.toISOString(),
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load messages",
    });
  }
});

// POST /api/partner/messages/read — mark messages as read
router.post("/messages/read", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const owner = await User.findOne({ firebaseUid: uid });
    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    await PartnerMessage.updateMany(
      { ownerId: owner._id, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, data: { updated: true } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark messages read",
    });
  }
});

// GET /api/partner/wishlist — get owner wishlist for connected partner view
router.get("/wishlist", verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const user = await User.findOne({ firebaseUid: uid }).lean();
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      $or: [
        { ownerId: user._id, status: "active" },
        { partnerId: user._id, status: "active" },
      ],
    }).lean();

    if (!connection) {
      res.status(404).json({ success: false, error: "No active connection" });
      return;
    }

    const targetOwnerId = connection.ownerId;

    const doc = await PartnerWishlist.findOne({ ownerId: targetOwnerId }).lean();

    res.json({ success: true, data: { items: doc?.items ?? [] } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load wishlist",
    });
  }
});

// POST /api/partner/wishlist — owner/partner add to shared wishlist
router.post("/wishlist", verifyToken, validate(schemas.partnerWishlist), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const user = await User.findOne({ firebaseUid: uid }).lean();
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const { item } = req.body as { item: string };

    const connection = await PartnerConnection.findOne({
      $or: [{ ownerId: user._id }, { partnerId: user._id }],
      status: "active",
    }).lean();

    if (!connection) {
      res.status(404).json({ success: false, error: "No active connection" });
      return;
    }

    const ownerId = connection.ownerId;

    const doc = await PartnerWishlist.findOneAndUpdate(
      { ownerId },
      {
        $setOnInsert: { connectionId: String(connection._id) },
        $push: { items: item.trim() },
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: { items: doc.items } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to add wishlist item",
    });
  }
});

// DELETE /api/partner/wishlist/:index — owner or partner removes item by index
router.delete("/wishlist/:index", verifyToken, validate(schemas.partnerWishlistDelete), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const user = await User.findOne({ firebaseUid: uid }).lean();
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const connection = await PartnerConnection.findOne({
      $or: [{ ownerId: user._id }, { partnerId: user._id }],
      status: "active",
    }).lean();

    if (!connection) {
      res.status(404).json({ success: false, error: "No active connection" });
      return;
    }

    const idx = Number(req.params.index);
    const doc = await PartnerWishlist.findOne({ ownerId: connection.ownerId });

    if (!doc) {
      res.status(404).json({ success: false, error: "Wishlist not found" });
      return;
    }

    const items = [...doc.items];
    if (idx < 0 || idx >= items.length) {
      res.status(400).json({ success: false, error: "Invalid item" });
      return;
    }

    items.splice(idx, 1);
    doc.items = items;
    await doc.save();

    res.json({ success: true, data: { items: doc.items } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove wishlist item",
    });
  }
});

export default router;
