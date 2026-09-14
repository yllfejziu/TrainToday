export type ActivityType =
  "running" | "strength" | "recovery" | "cycling" | "other";
export type Feeling = "great" | "good" | "tired" | "sore" | "unwell";
export type Provider = "Apple Health" | "Health Connect" | "TrainToday";
export interface Workout {
  id: string;
  type: ActivityType;
  title: string;
  start: string;
  durationMin: number;
  distanceKm?: number;
  heartRate?: number;
  effort?: number;
  source: string;
}
export interface DailyMetrics {
  date: string;
  sleepHours?: number;
  hrvMs?: number;
  restingHr?: number;
  steps?: number;
}
export interface HealthData {
  version: 1;
  provider: Provider;
  importedAt: string;
  workouts: Workout[];
  daily: DailyMetrics[];
}
export interface Preferences {
  units: "km" | "mi";
  availableMin: number;
}
export interface CheckIn {
  date: string;
  feeling: Feeling;
}
export interface Recommendation {
  type: "running" | "strength" | "recovery" | "rest";
  title: string[];
  description: string;
  durationMin: number;
  distanceKm?: number;
  intensity: string;
  effort: number;
  score: number | null;
  readiness: string;
  confidence: string;
  reasons: string[];
  steps: { title: string; duration: number; detail: string }[];
  sleep?: number;
  hrv?: number;
  hrvBaseline?: number;
  restingHr?: number;
  restingBaseline?: number;
  weeklySessions: number;
  weeklyMinutes: number;
  load: "light" | "balanced" | "high";
  fresh: boolean;
}
export const activityMeta: Record<
  ActivityType | "rest",
  { emoji: string; label: string }
> = {
  running: { emoji: "🏃", label: "Running" },
  strength: { emoji: "🏋️", label: "Strength training" },
  recovery: { emoji: "🌿", label: "Active recovery" },
  rest: { emoji: "☁️", label: "Rest" },
  cycling: { emoji: "🚴", label: "Cycling" },
  other: { emoji: "⚡", label: "Activity" },
};
