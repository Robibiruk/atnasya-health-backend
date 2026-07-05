// AI service — Gemini (primary), OpenRouter (fallback).
// Always injects full user health context into the system prompt.
import axios, { AxiosResponse } from "axios";
import { AIMessage, HealthContext } from "../types";

const TIMEOUT_MS = 12000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const PRIMARY_MODEL = process.env.PRIMARY_AI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL ?? "openai/gpt-oss-120b:free";
const GEMINI_MODEL = `models/${PRIMARY_MODEL}`;

if (!GEMINI_API_KEY) {
  console.warn("[AI Service] GEMINI_API_KEY is not set — Gemini calls will fail.");
}

/** Build Atnasya's health companion system prompt from live health context. */
export function buildSystemPrompt(ctx: HealthContext): string {
  const safe = (v: unknown): string =>
    v === null || v === undefined || v === "" ? "not logged yet" : String(v);

  return [
    `You are ${safe(
      ctx.userName,
    )}'s personal health companion for Atnasya Health — warm, caring, and knowledgeable about women's health.`,
    "",
    "User prompts may come in English or Arabic. Always respond in the same language as the user's last message. If unclear, default to English.",
    "",
    "Current context:",
    `- Date: ${safe(ctx.currentDate)}`,
    `- Cycle day: ${safe(ctx.dayOfCycle)} of ${safe(ctx.cycleLength)}-day cycle`,
    `- Phase: ${safe(ctx.phase)}`,
    `- Next period predicted: ${safe(ctx.nextPeriod)}`,
    `- Ovulation window: ${safe(ctx.ovulationStart)} – ${safe(ctx.ovulationEnd)}`,
    `- Recent vitals: BP ${safe(
      ctx.systolic,
    )}/${safe(ctx.diastolic)} mmHg | Blood sugar ${safe(ctx.sugar)} mg/dL | Weight ${safe(ctx.weight)} kg`,
    `- Recent symptoms: ${safe(ctx.symptomsThisWeek)}`,
    `- Mood trend: ${safe(ctx.moodTrend)}`,
    "- Health goals: Morning workouts, weight management, blood pressure improvement, blood sugar stability",
    "",
    "Guidelines:",
    "- Speak warmly and personally — address her by name when known.",
    "- Give practical, science-based advice.",
    "- Always recommend consulting a doctor for medical concerns.",
    "- Never diagnose conditions.",
    "- Be encouraging about her health journey.",
    "- Reference her specific data when relevant.",
  ].join("\n");
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason?: string;
    index?: number;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
    }>;
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
    }>;
  };
}

async function callGemini(
  systemPrompt: string,
  messages: AIMessage[],
): Promise<string> {
  const contents: Array<Record<string, unknown>> = [];

  if (systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: systemPrompt }],
    });
  }

  for (const msg of messages) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 800,
    },
  };

  try {
    const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res: AxiosResponse<GeminiResponse> = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: TIMEOUT_MS,
    });

    if (res.data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked: ${res.data.promptFeedback.blockReason}`);
    }

    const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }
    return text;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      throw new Error(
        "AI service temporarily unavailable due to high demand. Please try again in a moment.",
      );
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(String(err));
  }
}

async function callOpenRouter(
  systemPrompt: string,
  messages: AIMessage[],
): Promise<string> {
  const payload = {
    model: FALLBACK_MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 800,
    temperature: 0.8,
  };

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://atnasya.health",
      "X-Title": "Atnasya Health",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = (await res.json()) as { error?: { message: string } };
    throw new Error(
      `OpenRouter error: ${errorData.error?.message || res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new EmptyContentFromOpenRouter();
  return content;
}

class EmptyContentFromOpenRouter extends Error {
  constructor() {
    super("Empty response from OpenRouter");
    this.name = "EmptyContentFromOpenRouter";
  }
}

/**
 * Call AI with a system prompt and conversation history.
 * Primary: Gemini via Google AI Studio
 * Fallback: OpenRouter
 */
export async function callAI(
  systemPrompt: string,
  messages: AIMessage[],
): Promise<string> {
  try {
    return await callGemini(systemPrompt, messages);
  } catch (primaryErr) {
    try {
      return await callOpenRouter(systemPrompt, messages);
    } catch (fallbackErr) {
      const primaryError =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fallbackError =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `AI request failed. Primary: ${primaryError} | Fallback: ${fallbackError}`,
      );
    }
  }
}

/** Generate 3 daily insight cards as structured JSON. */
export async function generateInsightCards(systemPrompt: string): Promise<
  Array<{
    cardType: "cycle" | "vitals" | "wellness";
    emoji: string;
    title: string;
    body: string;
  }>
> {
  const messages: AIMessage[] = [
    {
      role: "user",
      content:
        'Generate 3 personalized daily health insight cards as ONLY valid JSON array (no markdown, no extra text): [{"cardType":"cycle","emoji":"🌸","title":"...","body":"..."},{"cardType":"vitals","emoji":"💗","title":"...","body":"..."},{"cardType":"wellness","emoji":"✨","title":"...","body":"..."}] Each body max 60 words. Warm, encouraging tone.',
    },
  ];

  const raw = await callAI(systemPrompt, messages);
  return parseInsightCards(raw);
}

/** Parse AI text into typed insight cards, with graceful fallback. */
export function parseInsightCards(raw: string): Array<{
  cardType: "cycle" | "vitals" | "wellness";
  emoji: string;
  title: string;
  body: string;
}> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/g, "");
  }
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    text = text.slice(firstBracket, lastBracket + 1);
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const cards = parsed
        .filter(
          (c): c is Record<string, unknown> =>
            typeof c === "object" && c !== null,
        )
        .map((c) => ({
          cardType: (["cycle", "vitals", "wellness"].includes(
            String(
              (c as Record<string, unknown>).cardType
                ? (c as Record<string, unknown>).cardType
                : (c as Record<string, unknown>).type,
            ),
          )
            ? String(
                (c as Record<string, unknown>).cardType
                  ? (c as Record<string, unknown>).cardType
                  : (c as Record<string, unknown>).type,
              )
            : "wellness") as "cycle" | "vitals" | "wellness",
          emoji: String((c as Record<string, unknown>).emoji ?? "🌸"),
          title: String(
            (c as Record<string, unknown>).title ?? "Today's Insight",
          ),
          body: String((c as Record<string, unknown>).body ?? ""),
        }));
      if (cards.length > 0) return cards;
    }
  } catch {
    // fall through
  }

  return defaultInsightCards();
}

function defaultInsightCards(): Array<{
  cardType: "cycle" | "vitals" | "wellness";
  emoji: string;
  title: string;
  body: string;
}> {
  return [
    {
      cardType: "cycle",
      emoji: "🌸",
      title: "Embrace your rhythm today",
      body: "Your body is doing wonderful things every cycle day. Tune in, notice how you feel, and honour it with gentle care.",
    },
    {
      cardType: "vitals",
      emoji: "💗",
      title: "Small steps, big heart",
      body: "A short walk and a glass of water today can work wonders for your blood pressure. You've got this.",
    },
    {
      cardType: "wellness",
      emoji: "✨",
      title: "Rest is productive too",
      body: "Give yourself permission to slow down this evening. Deep rest now means brighter mornings ahead.",
    },
  ];
}
