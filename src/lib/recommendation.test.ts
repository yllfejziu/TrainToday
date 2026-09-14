import { describe, it, expect } from "vitest";
import { recommend } from "./recommendation";
import { makeDemo } from "../data/demo";
import { dateKey, DAY } from "./dates";
import type { HealthData } from "./types";
const now = new Date("2026-09-14T12:00:00Z"),
  prefs = { units: "km" as const, availableMin: 30 };
const run = (
  data = makeDemo(now),
  feeling: "good" | "tired" | "sore" | "unwell" = "good",
) => recommend(data, feeling, prefs, now);
describe("daily recommendation", () => {
  it("prescribes an easy run with coherent duration and steps", () => {
    const r = run();
    expect(r.type).toBe("running");
    expect(r.durationMin).toBe(30);
    expect(r.steps.reduce((s, n) => s + n.duration, 0)).toBe(30);
    expect(r.distanceKm).toBeGreaterThan(0);
  });
  it("makes self-reported illness override recovery metrics", () =>
    expect(run(makeDemo(now), "unwell").type).toBe("rest"));
  it.each(["tired", "sore"] as const)("prioritizes a %s check-in", (f) =>
    expect(run(makeDemo(now), f).type).toBe("recovery"),
  );
  it("recommends strength when running dominates and strength is due", () => {
    const d = makeDemo(now);
    d.workouts = d.workouts.filter((w) => w.type !== "strength");
    expect(run(d).type).toBe("strength");
  });
  it("does not issue a score for missing or stale recovery data", () => {
    const d = makeDemo(now);
    d.daily = d.daily.slice(4);
    expect(run(d).score).toBe(null);
    expect(run(d).type).toBe("recovery");
  });
  it("keeps missing-data plans gentle even with an enthusiastic check-in", () => {
    const d = { ...makeDemo(now), daily: [] };
    expect(recommend(d, "great", prefs, now).type).toBe("recovery");
  });
  it("withholds a numeric score for one usable signal", () => {
    const d = makeDemo(now);
    d.daily = d.daily.map((x) => ({ date: x.date, sleepHours: x.sleepHours }));
    expect(run(d).score).toBe(null);
    expect(run(d).durationMin).toBeLessThanOrEqual(20);
  });
  it("does not lose last night’s metrics when today has only steps", () => {
    const d = makeDemo(now);
    d.daily[0] = { date: dateKey(now), steps: 2000 };
    expect(run(d).sleep).toBeDefined();
    expect(run(d).score).not.toBe(null);
  });
  it("suggests rest after very short sleep", () => {
    const d = makeDemo(now);
    d.daily[0].sleepHours = 4;
    expect(run(d).type).toBe("rest");
  });
  it("avoids stacking training after a completed workout", () => {
    const d = makeDemo(now);
    d.workouts[0].start = new Date(+now - 3600000).toISOString();
    expect(run(d).type).toBe("recovery");
  });
  it("uses demanding session history", () => {
    const d = makeDemo(now);
    d.workouts[0].effort = 8;
    expect(run(d).type).toBe("recovery");
  });
  it("uses a rise in seven-day training load", () => {
    const d = makeDemo(now);
    for (const w of d.workouts.slice(0, 3)) w.durationMin *= 3;
    expect(run(d).load).toBe("high");
    expect(run(d).type).toBe("recovery");
  });
  it("accounts for unusually high everyday activity", () => {
    const d = makeDemo(now);
    d.daily[1].steps = 30000;
    expect(run(d).type).toBe("recovery");
  });
  it("respects the available time", () =>
    expect(
      recommend(makeDemo(now), "good", { ...prefs, availableMin: 20 }, now)
        .durationMin,
    ).toBe(20));
  it("ignores future workouts", () => {
    const d = makeDemo(now);
    d.workouts.unshift({
      ...d.workouts[0],
      id: "future",
      start: new Date(+now + DAY).toISOString(),
      effort: 10,
    });
    expect(run(d).type).toBe("running");
  });
  it("handles a completely empty personal dataset", () => {
    const d: HealthData = {
      version: 1,
      provider: "TrainToday",
      importedAt: now.toISOString(),
      workouts: [],
      daily: [],
    };
    expect(run(d).type).toBe("recovery");
    expect(run(d).score).toBe(null);
  });
});
