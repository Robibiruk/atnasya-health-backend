// Atnasya Health Tracker — backend entry point.
// Startup sequence:
//   1. Load dotenv
//   2. Connect to MongoDB Atlas
//   3. Initialize Firebase Admin
//   4. Mount all routes under /api/*
//   5. Mount global error handler last
//   6. Start cron job for daily insights (6:00 AM)
//   7. Listen on PORT (default 3001)
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";

import { initFirebaseAdmin } from "./firebaseAdmin";
import { errorHandler } from "./middleware/errorHandler";
import { startInsightCron } from "./services/index";

import authRoutes from "./routes/auth";
import cycleRoutes from "./routes/cycles";
import symptomRoutes from "./routes/symptoms";
import vitalRoutes from "./routes/vitals";
import moodRoutes from "./routes/moods";
import insightRoutes from "./routes/insights";
import aiRoutes from "./routes/ai";
import secretRoutes from "./routes/secret";
import partnerRoutes from "./routes/partner";
import selfcareRoutes from "./routes/selfcare";
import dailyLogRoutes from "./routes/dailyLog";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// --- Middleware ---
app.use(helmet());
const allowedOrigins = [
  "https://atnasya-health.netlify.app",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://localhost:5174"]
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", service: "atnasya-health" } });
});

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/cycles", cycleRoutes);
app.use("/api/symptoms", symptomRoutes);
app.use("/api/vitals", vitalRoutes);
app.use("/api/moods", moodRoutes);
app.use("/api/insights", insightRoutes);

// AI routes with stricter rate limit
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/ai", aiLimiter);
app.use("/api/ai", aiRoutes);

app.use("/api/secret", secretRoutes);
app.use("/api/partner", partnerRoutes);
app.use("/api/selfcare", selfcareRoutes);
app.use("/api/daily-logs", dailyLogRoutes);

// --- Error handler (last) ---
app.use(errorHandler);

// --- Startup ---
async function start(): Promise<void> {
  // 1. Firebase Admin
  initFirebaseAdmin();

  // 2. MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    // eslint-disable-next-line no-console
    console.error("MONGODB_URI is not set — cannot connect to MongoDB.");
    process.exit(1);
  }
  try {
    await mongoose.connect(mongoUri);
    // eslint-disable-next-line no-console
    console.log("✅ MongoDB connected");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }

  // 6. Cron
  startInsightCron();

  // 7. Listen
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🌸 Atnasya Health backend running on http://localhost:${PORT}`);
  });
}

start();
