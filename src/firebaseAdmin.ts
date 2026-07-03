// Firebase Admin initialization — resilient for dev so the app boots without a real
// service account. The verifyToken middleware only runs admin.auth().verifyIdToken
// when a token is present; in local dev you can set ATNASYA_DEV_AUTH=1 to bypass.
import fs from "fs";
import path from "path";
import admin from "firebase-admin";

let initialized = false;

function initFirebaseAdmin(): void {
  if (initialized) return;

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  // If a path to a service-account file was provided, prefer it (production).
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  try {
    if (saPath && fs.existsSync(path.resolve(saPath))) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(path.resolve(saPath), "utf8")
      ) as admin.ServiceAccount;
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      initialized = true;
      return;
    }

    if (saJson) {
      const parsed = JSON.parse(saJson) as admin.ServiceAccount;
      // A real service account has a private_key; the placeholder in .env does not.
      if ((parsed as any).private_key) {
        admin.initializeApp({ credential: admin.credential.cert(parsed) });
        initialized = true;
        return;
      }
    }

    // No valid credentials available. App still boots; auth middleware will
    // return 401 in production, or accept a dev bypass locally.
    // eslint-disable-next-line no-console
    console.warn(
      "[firebase-admin] No valid service account — Firebase auth disabled (dev mode)."
    );
    initialized = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase-admin] init failed:", err);
  }
}

export { initFirebaseAdmin };
export default admin;
