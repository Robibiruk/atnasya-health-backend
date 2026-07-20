// ai.test.ts — mock AI providers for the aiService fallback behaviour.
// Architecture: Gemini (primary, via axios.post) → OpenRouter (fallback, via fetch).
import axios from "axios";
import { callAI } from "../services/aiService";

let passed = 0;
let failed = 0;

function assert(name: string, condition: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${name}`);
  }
}

// --- Gemini mock (axios.post) ---
let geminiImpl: () => Promise<any> = async () => {
  throw new Error("gemini not configured");
};
(axios as any).post = async (..._args: any[]) => geminiImpl();
// isAxiosError is referenced inside the service's catch block.
(axios as any).isAxiosError = () => false;

// --- OpenRouter mock (global fetch) ---
let fetchImpl: () => Promise<any> = async () => {
  throw new Error("fetch not configured");
};
(global as any).fetch = async (..._args: any[]) => fetchImpl();

function geminiOk(text: string) {
  return {
    data: { candidates: [{ content: { parts: [{ text }] } }] },
  };
}

function openRouterOk(content: string) {
  return {
    ok: true,
    statusText: "OK",
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function openRouterFail(message: string) {
  return {
    ok: false,
    statusText: message,
    json: async () => ({ error: { message } }),
  };
}

export async function run(): Promise<void> {
  console.log("ai.test");

  // 1. Successful Gemini response → returns parsed content
  geminiImpl = async () => geminiOk("hello from gemini");
  fetchImpl = async () => {
    throw new Error("fetch should not be called");
  };
  {
    const reply = await callAI("sys", [{ role: "user", content: "hi" }]);
    assert("Successful Gemini → returns content", reply === "hello from gemini");
  }

  // 2. Gemini fails → falls back to OpenRouter
  geminiImpl = async () => {
    throw new Error("gemini 500");
  };
  fetchImpl = async () => openRouterOk("openrouter-reply");
  {
    const reply = await callAI("sys", [{ role: "user", content: "hi" }]);
    assert("Fallback → returns OpenRouter content", reply === "openrouter-reply");
  }

  // 3. Both fail → throws error mentioning both providers
  geminiImpl = async () => {
    throw new Error("gemini down");
  };
  fetchImpl = async () => openRouterFail("openrouter down");
  {
    let threw = false;
    let message = "";
    try {
      await callAI("sys", [{ role: "user", content: "hi" }]);
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    }
    assert("Both fail → throws", threw);
    assert(
      "Both fail → message mentions Primary and Fallback",
      message.includes("Primary") && message.includes("Fallback")
    );
  }

  console.log(`\nai: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) run();
