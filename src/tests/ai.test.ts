// ai.test.ts — mock AI providers for the aiService fallback behaviour.
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

// Minimal mock so we don't hit the network.
const postSpy = jestish_post_spy();

function jestish_post_spy() {
  let implementations: Array<() => Promise<any>> = [];
  const spy = async (..._args: any[]) => {
    const impl = implementations.shift();
    if (impl) return impl();
    return { data: { choices: [{ message: { content: "fallback-ok" } }] } };
  };
  (spy as any).setImpls = (fns: Array<() => Promise<any>>) => {
    implementations = fns;
  };
  return spy;
}
(axios as any).post = postSpy;

export async function run(): Promise<void> {
  console.log("ai.test");

  // 1. Successful OpenRouter response → returns parsed content
  (postSpy as any).setImpls([
    async () => ({
      data: { choices: [{ message: { content: "hello from gemini" } }] },
    }),
  ]);
  {
    const reply = await callAI("sys", [{ role: "user", content: "hi" }]);
    assert("Successful response → returns content", reply === "hello from gemini");
  }

  // 2. OpenRouter fails → falls back to OpenCode Zen
  (postSpy as any).setImpls([
    async () => {
      throw new Error("openrouter 500");
    },
    async () => ({
      data: { choices: [{ message: { content: "zen-reply" } }] },
    }),
  ]);
  {
    const reply = await callAI("sys", [{ role: "user", content: "hi" }]);
    assert("Fallback → returns zen content", reply === "zen-reply");
  }

  // 3. Both fail → throws error with clear message
  (postSpy as any).setImpls([
    async () => {
      throw new Error("openrouter down");
    },
    async () => {
      throw new Error("zen down");
    },
  ]);
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
      "Both fail → message mentions both providers",
      message.includes("openrouter") && message.includes("zen")
    );
  }

  console.log(`\nai: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) run();
