// Validation middleware + reusable Zod schemas for request bodies.
import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message = Object.entries(flat.fieldErrors)
        .map(([field, msgs]) => `${field}: ${msgs?.join(", ")}`)
        .join("; ") || flat.formErrors.join("; ");
      return res.status(400).json({ success: false, error: `Invalid request body: ${message}` });
    }
    req.body = parsed.data;
    next();
  };
}

export const schemas = {
  authRegister: z.object({
    token: z.string().optional(),
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  authSettings: z.object({ name: z.string().optional() }),
  cycleCreate: z.object({
    periodStart: z.string().min(8),
    periodEnd: z.string().min(8).optional(),
    notes: z.string().optional(),
  }),
  cyclePatch: z.object({
    periodStart: z.string().min(8).optional(),
    periodEnd: z.string().min(8).optional(),
    notes: z.string().optional(),
  }),
  dailyLogCreate: z.object({
    date: z.string().min(8),
    summary: z.string().optional(),
    details: z.record(z.any()).optional(),
  }),
  dailyLogPatch: z.object({
    summary: z.string().optional(),
    details: z.record(z.any()).optional(),
  }),
  moodCreate: z.object({
    date: z.string().min(8),
    score: z.coerce.number().int().min(1).max(5),
    emoji: z.string().optional(),
    note: z.string().optional(),
  }),
  symptomCreate: z.object({
    date: z.string().min(8),
    items: z.array(z.object({ name: z.string(), intensity: z.coerce.number().int() })),
  }),
  vitalCreate: z.object({
    date: z.string().min(8),
    bp: z.object({ systolic: z.coerce.number(), diastolic: z.coerce.number() }).optional(),
    bloodSugar: z.object({ value: z.coerce.number(), unit: z.string(), timing: z.string() }).optional(),
    weight: z.object({ value: z.coerce.number(), unit: z.string() }).optional(),
  }),
  selfcareCreate: z.object({
    date: z.string().min(8),
    mood: z.coerce.number().optional(),
    water: z.coerce.number().optional(),
    sleep: z.coerce.number().optional(),
    energy: z.coerce.number().optional(),
    notes: z.string().optional(),
  }),
  partnerInvite: z.object({}),
  partnerAccept: z.object({ inviteCode: z.string().length(6) }),
  partnerSettings: z.object({
    shareLevel: z.enum(["phase_only", "full_summary"]).optional(),
    shareMood: z.boolean().optional(),
    shareSymptoms: z.boolean().optional(),
    sharePregnancy: z.boolean().optional(),
  }),
  partnerMessage: z.object({
    message: z.string().min(1).max(500),
    emoji: z.string().optional(),
  }),
  insightGenerate: z.object({}),
  aiChat: z.object({ messages: z.array(z.any()).max(50).optional() }),
  partnerWishlist: z.object({
    item: z.string().min(1, "item is required").max(200, "Item is too long"),
  }),
  partnerWishlistDelete: z.object({}),
  secretMessage: z.object({
    sender: z.enum(["user", "assistant", "partner"]),
    message: z.string().min(1, "message is required").max(4000, "Message is too long"),
  }),
};
