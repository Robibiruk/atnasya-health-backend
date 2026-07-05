// Secret chat routes — GET+POST /messages
import { Router, Request, Response } from "express";
import { ChatMessage } from "../models/ChatMessage";
import { verifyToken } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { schemas } from "../middleware/validation";

const router = Router();
router.use(verifyToken);

router.get("/messages", async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const messages = await ChatMessage.find({ userId: uid })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to load messages",
    });
  }
});

router.post("/messages", validate(schemas.secretMessage), async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { sender, message } = req.body as {
      sender: "user" | "assistant" | "partner";
      message: string;
    };
    if (!message || !sender) {
      res
        .status(400)
        .json({ success: false, error: "sender and message are required" });
      return;
    }
    const doc = await ChatMessage.create({
      userId: uid,
      sender,
      message,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to post message",
    });
  }
});

export default router;
