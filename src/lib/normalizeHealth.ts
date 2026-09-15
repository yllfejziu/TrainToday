import { DAY, dateKey } from "./dates";
import type { ActivityType, DailyMetrics, HealthData, Workout } from "./types";

function num(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string"
    ? value.trim().slice(0, 120) || fallback
    : fallback;
}

const validTypes: ActivityType[] = [
  "running",
  "strength",
  "recovery",
  "cycling",
  "other",
];

export function normalizeHealth(input: unknown, now = new Date()): HealthData {
  if (!input || typeof input !== "object")
    throw Error("Apple Health did not return readable data.");

  const data = input as Record<string, unknown>;
  if (
    data.version !== 1 ||
    data.provider !== "Apple Health" ||
    !Array.isArray(data.workouts) ||
    !Array.isArray(data.daily)
  )
    throw Error("Apple Health returned data in an unexpected format.");

  const cutoff = now.getTime() - 90 * DAY;
  const future = now.getTime() + 5 * 60 * 1000;
  const workouts: Workout[] = [];

  for (const raw of data.workouts) {
    if (!raw || typeof raw !== "object")
      throw Error("Apple Health returned an invalid activity.");
    const workout = raw as Record<string, unknown>;
    const durationMin = num(workout.durationMin, 0.1, 1440);
    if (
      !validDate(workout.start) ||
      durationMin === undefined ||
      !validTypes.includes(workout.type as ActivityType)
    )
      throw Error("Apple Health returned an invalid activity.");

    const start = new Date(workout.start);
    if (start.getTime() < cutoff || start.getTime() > future) continue;
    const type = workout.type as ActivityType;
    workouts.push({
      id: cleanText(workout.id, `${type}-${start.toISOString()}`),
      type,
      title: cleanText(workout.title, type),
      start: start.toISOString(),
      durationMin,
      distanceKm: num(workout.distanceKm, 0, 1000),
      heartRate: num(workout.heartRate, 20, 250),
      effort: num(workout.effort, 1, 10),
      source: cleanText(workout.source, "Apple Health"),
    });
  }

  const daily: DailyMetrics[] = [];
  for (const raw of data.daily) {
    if (!raw || typeof raw !== "object")
      throw Error("Apple Health returned an invalid daily summary.");
    const row = raw as Record<string, unknown>;
    if (
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !validDate(row.date) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date
    )
      throw Error("Apple Health returned an invalid daily summary date.");
    if (row.date < dateKey(new Date(cutoff)) || row.date > dateKey(now))
      continue;
    daily.push({
      date: row.date,
      sleepHours: num(row.sleepHours, 0, 24),
      hrvMs: num(row.hrvMs, 1, 500),
      restingHr: num(row.restingHr, 20, 220),
      steps: num(row.steps, 0, 200000),
    });
  }

  const unique = new Map(
    workouts.map((workout) => [
      `${workout.type}-${workout.start}-${Math.round(workout.durationMin)}`,
      workout,
    ]),
  );
  const days = new Map<string, DailyMetrics>();
  for (const day of daily)
    days.set(day.date, {
      ...days.get(day.date),
      ...Object.fromEntries(
        Object.entries(day).filter(([, value]) => value !== undefined),
      ),
    } as DailyMetrics);
  const usable = [...days.values()].filter(
    (day) =>
      day.sleepHours !== undefined ||
      day.hrvMs !== undefined ||
      day.restingHr !== undefined ||
      day.steps !== undefined,
  );
  if (!unique.size && !usable.length)
    throw Error(
      "No health data was available for the last 90 days. Check TrainToday’s access in Settings → Health → Data Access & Devices.",
    );

  return {
    version: 1,
    provider: "Apple Health",
    importedAt: now.toISOString(),
    workouts: [...unique.values()].sort((a, b) =>
      b.start.localeCompare(a.start),
    ),
    daily: usable.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
