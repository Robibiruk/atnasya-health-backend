// Partner service — invite code generation + empathy tip generation.
import { callAI } from "./aiService";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a 6-character uppercase alphanumeric code (no O/0/I/1 ambiguity). */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Generate an AI empathy tip for a partner based on the owner's cycle phase. */
export async function generateEmpathyTip(
  phase: string,
  dayOfCycle: number,
  daysUntilPeriod: number
): Promise<string> {
  const systemPrompt =
    "You are a warm, caring relationship assistant. Write one short, practical sentence " +
    "a caring partner could use to support their significant other today. Keep it under 20 words. " +
    "No medical language. Be gentle and encouraging.";

  const userMessage =
    `Your partner is currently in their ${phase} phase, day ${dayOfCycle} of their cycle, ` +
    `with their period arriving in ${daysUntilPeriod} days. ` +
    `Write one warm, practical sentence you could say to support them today.`;

  try {
    const tip = await callAI(systemPrompt, [
      { role: "user", content: userMessage },
    ]);
    return tip.trim().replace(/^["']|["']$/g, "");
  } catch {
    // Graceful fallback if AI is unavailable
    const fallbacks: Record<string, string> = {
      menstrual: "Bring her a warm drink and give her some extra rest today.",
      follicular: "She's feeling more energetic — plan something fun together!",
      fertile: "She's at peak energy — a thoughtful gesture would mean a lot.",
      ovulation: "Today is a great day for a surprise date or sweet note.",
      luteal: "She may need extra patience and a listening ear right now.",
    };
    return fallbacks[phase] ?? "A small act of kindness goes a long way today.";
  }
}
