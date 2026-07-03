// auth.test.ts — mock Firebase Admin token verification.
import { verifyToken } from "../middleware/auth";

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

function mockReq(header?: string): any {
  return { headers: header ? { authorization: header } : {} };
}
function mockRes(): any {
  let captured: any = null;
  return {
    status(code: number) {
      captured = { ...captured, code };
      return this;
    },
    json(body: any) {
      captured = { ...captured, body };
      return { captured };
    },
    captured: () => captured,
  };
}

export async function run(): Promise<void> {
  console.log("auth.test");

  // Enable dev bypass so we can test without real Firebase.
  process.env.ATNASYA_DEV_AUTH = "1";

  // 1. Missing header → 401
  {
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false as boolean;
    await verifyToken(req, res, () => {
      nextCalled = true;
    });
    const out = res.captured();
    assert("Missing header → 401", out.code === 401);
    assert("Missing header → success:false", out.body.success === false);
    assert("Missing header → next not called", !nextCalled);
  }

  // 2. Valid dev token → calls next()
  {
    const req = mockReq("Bearer dev:test-user-uid");
    const res = mockRes();
    let nextCalled = false as boolean;
    await verifyToken(req, res, () => {
      nextCalled = true;
    });
    assert("Valid dev token → next called", nextCalled);
    assert("Valid dev token → req.user attached", req.user?.uid === "test-user-uid");
  }

  // 3. Invalid (non-dev) token → 401 (Firebase not configured, so bogus token fails)
  {
    const req = mockReq("Bearer bogus-token-value");
    const res = mockRes();
    let nextCalled = false as boolean;
    await verifyToken(req, res, () => {
      nextCalled = true;
    });
    const out = res.captured();
    assert("Invalid token → 401", out.code === 401);
    assert("Invalid token → next not called", !nextCalled);
  }

  console.log(`\nauth: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) run();
