// Shared TypeScript interfaces for Atnasya Health Tracker backend.
// Every data shape is defined here — zero `any` types anywhere.

export interface UserSettings {
  theme: "light" | "dark";
  anonymousMode: boolean;
  notifications: boolean;
  unit: "metric" | "imperial";
}

export interface UserDoc {
  firebaseUid: string;
  name: string;
  email: string;
  settings: UserSettings;
  role: "tracker" | "partner";
  onboardingCompleted: boolean;
  goal: "track" | "conceive" | "avoid" | "wellness" | "understand";
  birthYear: number | null;
  onboarding: {
    periodLength: number | null;
    cycleLength: number | null;
    pregnant: boolean | null;
  };
  notificationPrefs: {
    periodReminders: boolean;
    ovulationAlerts: boolean;
    dailyLogReminder: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CycleDoc {
  userId: string;
  periodStart: Date;
  periodEnd: Date | null;
  cycleLength: number | null;
  ovulationDate: Date | null;
  notes: string | null;
  createdAt: Date;
}

export interface SymptomItem {
  name: string;
  intensity: number; // 1-5
}

export interface SymptomDoc {
  userId: string;
  date: Date;
  items: SymptomItem[];
  cyclePhase: string;
  createdAt: Date;
}

export interface BloodPressure {
  systolic: number;
  diastolic: number;
}

export interface BloodSugar {
  value: number;
  unit: "mg/dL" | "mmol/L";
  timing: "fasting" | "post-meal";
}

export interface Weight {
  value: number;
  unit: "kg" | "lbs";
}

export interface VitalDoc {
  userId: string;
  date: Date;
  bp: BloodPressure | null;
  bloodSugar: BloodSugar | null;
  weight: Weight | null;
  cyclePhase: string;
  createdAt: Date;
}

export interface MoodDoc {
  userId: string;
  date: Date;
  score: number; // 1-5
  emoji: string;
  note: string | null;
  createdAt: Date;
}

export type InsightCardType = "cycle" | "vitals" | "wellness";

export interface InsightCard {
  cardType: InsightCardType;
  emoji: string;
  title: string;
  body: string;
}

export interface InsightDoc {
  userId: string;
  date: Date;
  cards: InsightCard[];
  liked: number[];
  createdAt: Date;
}

export type ChatSender = "user" | "assistant" | "partner";

export interface ChatMessageDoc {
  userId: string;
  sender: ChatSender;
  message: string;
  encrypted: boolean;
  createdAt: Date;
}

export interface ArticleDoc {
  slug: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: Date;
}

// Prediction algorithm return type
export interface CyclePrediction {
  nextPeriod: Date;
  ovulationDay: Date;
  fertileStart: Date;
  fertileEnd: Date;
  avgLength: number;
}

export type CyclePhase =
  | "menstrual"
  | "follicular"
  | "fertile"
  | "ovulation"
  | "luteal"
  | "unknown";

// API response envelope
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// AI message shape
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Self-care entry
export interface SelfcareDoc {
  userId: string;
  date: Date;
  mood: number | null;
  water: number | null;
  sleep: number | null;
  energy: number | null;
  notes: string | null;
  createdAt: Date;
}

// Health context injected into AI system prompt
export interface HealthContext {
  currentDate: string;
  dayOfCycle: number;
  cycleLength: number;
  phase: CyclePhase;
  nextPeriod: string;
  ovulationStart: string;
  ovulationEnd: string;
  systolic: number | null;
  diastolic: number | null;
  sugar: number | null;
  weight: number | null;
  symptomsThisWeek: string;
  moodTrend: string;
  userName: string;
}
