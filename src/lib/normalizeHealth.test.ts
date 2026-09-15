import { describe, expect, it } from "vitest";
import { makeDemo } from "../data/demo";
import { normalizeHealth } from "./normalizeHealth";

const now = new Date("2026-09-14T12:00:00Z");

function appleData() {
  return { ...makeDemo(now), provider: "Apple Health" as const };
}

describe("Apple Health normalization", () => {
  it("accepts the native bridge format", () =>
    expect(normalizeHealth(appleData(), now).workouts.length).toBe(12));

  it("rejects unrelated data", () =>
    expect(() => normalizeHealth({ hello: true }, now)).toThrow());

  it("rejects an invalid workout atomically", () => {
    const data = appleData();
    data.workouts[1].durationMin = -5;
    expect(() => normalizeHealth(data, now)).toThrow(/activity/);
  });

  it("deduplicates the same workout recorded twice", () => {
    const data = appleData();
    data.workouts.push({ ...data.workouts[0], id: "duplicate" });
    expect(normalizeHealth(data, now).workouts.length).toBe(12);
  });

  it("filters future and old activities", () => {
    const data = appleData();
    data.workouts[0].start = "2030-09-14T12:00:00Z";
    data.workouts[1].start = "2020-09-14T12:00:00Z";
    expect(normalizeHealth(data, now).workouts.length).toBe(10);
  });

  it("rejects impossible calendar dates", () => {
    const data = appleData();
    data.daily[0].date = "2026-02-30";
    expect(() => normalizeHealth(data, now)).toThrow(/date/);
  });

  it("keeps unavailable recovery metrics missing", () => {
    const data = appleData();
    data.daily[0] = { date: "2026-09-14", steps: 1200 };
    expect(normalizeHealth(data, now).daily[0].hrvMs).toBeUndefined();
  });
});
