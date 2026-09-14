import type { HealthData, Workout } from "../lib/types";
import { dateKey, dayBefore } from "../lib/dates";
export function makeDemo(now = new Date()): HealthData {
  const workout = (
    days: number,
    type: Workout["type"],
    durationMin: number,
    distanceKm?: number,
  ): Workout => {
    const d = dayBefore(now, days);
    d.setHours(type === "strength" ? 18 : 7, 12, 0, 0);
    return {
      id: `demo-${days}`,
      type,
      title:
        type === "strength"
          ? "Full-body strength"
          : days === 1
            ? "Morning run"
            : days === 4
              ? "Easy afternoon run"
              : "Easy run",
      start: d.toISOString(),
      durationMin,
      distanceKm,
      heartRate: type === "strength" ? 118 : 138,
      effort: type === "strength" ? 5 : 4,
      source: "Apple Health",
    };
  };
  return {
    version: 1,
    provider: "Apple Health",
    importedAt: now.toISOString(),
    workouts: [
      workout(1, "running", 38, 6.2),
      workout(3, "strength", 42),
      workout(4, "running", 31, 5),
      workout(8, "running", 42, 6.7),
      workout(10, "strength", 40),
      workout(12, "running", 32, 5.2),
      workout(15, "running", 40, 6.5),
      workout(17, "strength", 40),
      workout(19, "running", 32, 5.1),
      workout(22, "running", 39, 6.2),
      workout(24, "strength", 40),
      workout(26, "running", 32, 5.2),
    ],
    daily: Array.from({ length: 29 }, (_, i) => ({
      date: dateKey(dayBefore(now, i)),
      sleepHours: i === 0 ? 7.8 : 7.3 + [0.2, 0.5, 0, 0.6][i % 4],
      hrvMs: i === 0 ? 62 : 60 + [0, 3, -2, 1][i % 4],
      restingHr: i === 0 ? 52 : 53 + [0, 1, -1][i % 3],
      steps: i === 0 ? 1240 : 7200 + (i % 4) * 950,
    })),
  };
}
