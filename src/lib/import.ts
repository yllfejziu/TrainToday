import { SaxesParser } from "saxes";
import { DAY, dateKey } from "./dates";
import type { ActivityType, DailyMetrics, HealthData, Workout } from "./types";
function num(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : undefined;
}
function validDate(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function cleanText(v: unknown, fallback: string) {
  return typeof v === "string" ? v.trim().slice(0, 120) || fallback : fallback;
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
    throw Error("This file does not contain a health export.");
  const d = input as Record<string, unknown>;
  if (
    d.version !== 1 ||
    !["Apple Health", "Health Connect", "TrainToday"].includes(
      String(d.provider),
    ) ||
    !Array.isArray(d.workouts) ||
    !Array.isArray(d.daily)
  )
    throw Error(
      "Use an Apple Health export.xml or a TrainToday-format JSON export. Download the example below for the JSON format.",
    );
  const cutoff = now.getTime() - 90 * DAY,
    future = now.getTime() + 5 * 60 * 1000;
  const workouts: Workout[] = [];
  for (const raw of d.workouts) {
    if (!raw || typeof raw !== "object")
      throw Error("An activity is invalid. No data has been changed.");
    const w = raw as Record<string, unknown>,
      durationMin = num(w.durationMin, 0.1, 1440);
    if (
      !validDate(w.start) ||
      durationMin === undefined ||
      !validTypes.includes(w.type as ActivityType)
    )
      throw Error(
        "An activity has an invalid date, duration, or type. No data has been changed.",
      );
    const start = new Date(w.start);
    if (start.getTime() < cutoff || start.getTime() > future) continue;
    const type = w.type as ActivityType;
    workouts.push({
      id: cleanText(w.id, `${type}-${start.toISOString()}`),
      type,
      title: cleanText(w.title, type),
      start: start.toISOString(),
      durationMin,
      distanceKm: num(w.distanceKm, 0, 1000),
      heartRate: num(w.heartRate, 20, 250),
      effort: num(w.effort, 1, 10),
      source: cleanText(w.source, String(d.provider)),
    });
  }
  const daily: DailyMetrics[] = [];
  for (const raw of d.daily) {
    if (!raw || typeof raw !== "object")
      throw Error("A daily summary is invalid.");
    const row = raw as Record<string, unknown>;
    if (
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !validDate(row.date) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date
    )
      throw Error("A daily summary has an invalid date.");
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
    workouts.map((w) => [
      `${w.type}-${w.start}-${Math.round(w.durationMin)}`,
      w,
    ]),
  );
  const days = new Map<string, DailyMetrics>();
  for (const day of daily)
    days.set(day.date, {
      ...days.get(day.date),
      ...Object.fromEntries(
        Object.entries(day).filter(([, v]) => v !== undefined),
      ),
    } as DailyMetrics);
  const usable = [...days.values()].filter(
    (d) =>
      d.sleepHours !== undefined ||
      d.hrvMs !== undefined ||
      d.restingHr !== undefined ||
      d.steps !== undefined,
  );
  if (!unique.size && !usable.length)
    throw Error(
      "No usable health data from the last 90 days was found. Your existing data is unchanged.",
    );
  return {
    version: 1,
    provider: d.provider as HealthData["provider"],
    importedAt: now.toISOString(),
    workouts: [...unique.values()].sort((a, b) =>
      b.start.localeCompare(a.start),
    ),
    daily: usable.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
function appleDate(s: string) {
  return new Date(
    s.replace(
      /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)$/,
      "$1T$2$3:$4",
    ),
  );
}
function appleType(s: string): ActivityType {
  if (/Running/.test(s)) return "running";
  if (/Strength|FunctionalStrength|CrossTraining/.test(s)) return "strength";
  if (/Walking|Yoga|MindAndBody|Flexibility/.test(s)) return "recovery";
  if (/Cycling/.test(s)) return "cycling";
  return "other";
}
function km(value: string, unit: string) {
  const n = Number(value);
  return unit === "mi"
    ? n * 1.609344
    : unit === "m"
      ? n / 1000
      : unit === "km"
        ? n
        : undefined;
}
export function parseAppleXml(text: string, now = new Date()): HealthData {
  const parser = new SaxesParser({ xmlns: false }),
    workouts: Workout[] = [];
  const daily = new Map<
    string,
    {
      hrv: number[];
      rhr: number[];
      steps: Map<string, number>;
      sleep: [number, number][];
    }
  >();
  let workout: Workout | undefined,
    foundRoot = false;
  const cutoff = now.getTime() - 90 * DAY;
  const ensure = (key: string) => {
    if (!daily.has(key))
      daily.set(key, { hrv: [], rhr: [], steps: new Map(), sleep: [] });
    return daily.get(key)!;
  };
  parser.on("opentag", (tag) => {
    const a = tag.attributes as Record<string, string>;
    if (tag.name === "HealthData") foundRoot = true;
    if (tag.name === "Workout") {
      const start = appleDate(a.startDate ?? ""),
        duration =
          Number(a.duration) *
          (a.durationUnit === "hr" ? 60 : a.durationUnit === "s" ? 1 / 60 : 1);
      if (
        !Number.isFinite(+start) ||
        +start < cutoff ||
        +start > +now ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        workout = undefined;
        return;
      }
      const type = appleType(a.workoutActivityType ?? "");
      const title = (a.workoutActivityType ?? "Workout")
        .replace("HKWorkoutActivityType", "")
        .replace(/([a-z])([A-Z])/g, "$1 $2");
      workout = {
        id: `apple-${type}-${start.toISOString()}`,
        type,
        title,
        start: start.toISOString(),
        durationMin: duration,
        distanceKm: km(a.totalDistance, a.totalDistanceUnit),
        source: a.sourceName || "Apple Health",
      };
    }
    if (tag.name === "WorkoutStatistics" && workout) {
      if (/DistanceWalkingRunning|DistanceCycling/.test(a.type))
        workout.distanceKm = km(a.sum, a.unit);
      if (a.type === "HKQuantityTypeIdentifierHeartRate")
        workout.heartRate = Number(a.average);
    }
    if (tag.name !== "Record") return;
    const start = appleDate(a.startDate ?? ""),
      end = appleDate(a.endDate ?? a.startDate ?? "");
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      +end < cutoff ||
      +end > +now ||
      +end < +start
    )
      return;
    const sleepDate = new Date(end);
    if (
      a.type === "HKCategoryTypeIdentifierSleepAnalysis" &&
      sleepDate.getHours() >= 18
    )
      sleepDate.setDate(sleepDate.getDate() + 1);
    const row = ensure(
        dateKey(
          a.type === "HKCategoryTypeIdentifierSleepAnalysis" ? sleepDate : end,
        ),
      ),
      value = Number(a.value);
    if (
      a.type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" &&
      Number.isFinite(value)
    )
      row.hrv.push(a.unit === "s" ? value * 1000 : value);
    if (
      a.type === "HKQuantityTypeIdentifierRestingHeartRate" &&
      Number.isFinite(value)
    )
      row.rhr.push(value);
    if (
      a.type === "HKQuantityTypeIdentifierStepCount" &&
      Number.isFinite(value)
    )
      row.steps.set(
        a.sourceName || "Apple Health",
        (row.steps.get(a.sourceName || "Apple Health") ?? 0) + value,
      );
    if (
      a.type === "HKCategoryTypeIdentifierSleepAnalysis" &&
      /Asleep/.test(a.value) &&
      +end - +start < DAY
    )
      row.sleep.push([+start, +end]);
  });
  parser.on("closetag", (tag) => {
    if (tag.name === "Workout" && workout) {
      workouts.push(workout);
      workout = undefined;
    }
  });
  try {
    parser.write(text).close();
  } catch {
    throw Error(
      "This XML file could not be read. Choose the original export.xml from Apple Health.",
    );
  }
  if (!foundRoot)
    throw Error(
      "This is not an Apple Health export. Choose export.xml from your Health export folder.",
    );
  const summaries: DailyMetrics[] = [];
  for (const [date, r] of daily) {
    const intervals = r.sleep.sort((a, b) => a[0] - b[0]);
    let total = 0,
      left = 0,
      right = 0;
    for (const [s, e] of intervals) {
      if (s > right) {
        total += right - left;
        left = s;
        right = e;
      } else right = Math.max(right, e);
    }
    total += right - left;
    summaries.push({
      date,
      sleepHours: intervals.length ? total / 3600000 : undefined,
      hrvMs: r.hrv.length
        ? r.hrv.reduce((s, n) => s + n, 0) / r.hrv.length
        : undefined,
      restingHr: r.rhr.length
        ? r.rhr.reduce((s, n) => s + n, 0) / r.rhr.length
        : undefined,
      steps: r.steps.size ? Math.max(...r.steps.values()) : undefined,
    });
  }
  return normalizeHealth(
    { version: 1, provider: "Apple Health", workouts, daily: summaries },
    now,
  );
}
export function parseHealthText(text: string, now = new Date()) {
  return text.trimStart().startsWith("<")
    ? parseAppleXml(text, now)
    : normalizeHealth(JSON.parse(text), now);
}
