import { describe, it, expect } from "vitest";
import { normalizeHealth, parseAppleXml, parseHealthText } from "./import";
import { makeDemo } from "../data/demo";
const now = new Date("2026-09-14T12:00:00Z");
const wrap = (content: string) =>
  `<?xml version="1.0"?><HealthData>${content}</HealthData>`;
const record = (
  type: string,
  start: string,
  end: string,
  value: string,
  unit = "",
) =>
  `<Record type="${type}" startDate="${start}" endDate="${end}" value="${value}" unit="${unit}"/>`;
describe("health imports", () => {
  it("accepts the documented normalized format", () =>
    expect(normalizeHealth(makeDemo(now), now).workouts.length).toBe(12));
  it("rejects an unrelated JSON export instead of inventing values", () =>
    expect(() => normalizeHealth({ hello: true }, now)).toThrow());
  it("rejects a malformed file atomically", () => {
    const d = makeDemo(now);
    d.workouts[1].durationMin = -5;
    expect(() => normalizeHealth(d, now)).toThrow(/duration/);
  });
  it("deduplicates the same workout recorded twice", () => {
    const d = makeDemo(now);
    d.workouts.push({ ...d.workouts[0], id: "duplicate" });
    expect(normalizeHealth(d, now).workouts.length).toBe(12);
  });
  it("filters future and old activities", () => {
    const d = makeDemo(now);
    d.workouts[0].start = "2030-09-14T12:00:00Z";
    d.workouts[1].start = "2020-09-14T12:00:00Z";
    expect(normalizeHealth(d, now).workouts.length).toBe(10);
  });
  it("rejects impossible calendar dates", () => {
    const d = makeDemo(now);
    d.daily[0].date = "2026-02-30";
    expect(() => normalizeHealth(d, now)).toThrow(/date/);
  });
  it("does not substitute missing recovery metrics", () => {
    const d = makeDemo(now);
    d.daily[0] = { date: "2026-09-14", steps: 1200 };
    expect(normalizeHealth(d, now).daily[0].hrvMs).toBeUndefined();
  });
  it("parses Apple dates, distances and workout statistics", () => {
    const xml = wrap(
      '<Workout workoutActivityType="HKWorkoutActivityTypeRunning" startDate="2026-09-13 08:00:00 +0200" duration="0.5" durationUnit="hr" sourceName="Apple Watch"><WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="3.1" unit="mi"/><WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="140" unit="count/min"/></Workout>',
    );
    const w = parseAppleXml(xml, now).workouts[0];
    expect(w.start).toBe("2026-09-13T06:00:00.000Z");
    expect(w.durationMin).toBe(30);
    expect(w.distanceKm).toBeCloseTo(4.989);
    expect(w.heartRate).toBe(140);
  });
  it("merges overlapping sleep records instead of counting stages twice", () => {
    const xml = wrap(
      record(
        "HKCategoryTypeIdentifierSleepAnalysis",
        "2026-09-13 22:00:00 +0200",
        "2026-09-14 06:00:00 +0200",
        "HKCategoryValueSleepAnalysisAsleep",
      ) +
        record(
          "HKCategoryTypeIdentifierSleepAnalysis",
          "2026-09-13 22:00:00 +0200",
          "2026-09-13 23:00:00 +0200",
          "HKCategoryValueSleepAnalysisAsleepCore",
        ) +
        record(
          "HKCategoryTypeIdentifierSleepAnalysis",
          "2026-09-14 00:00:00 +0200",
          "2026-09-14 01:00:00 +0200",
          "HKCategoryValueSleepAnalysisAsleepDeep",
        ),
    );
    expect(
      parseAppleXml(xml, now).daily.reduce(
        (s, d) => s + (d.sleepHours ?? 0),
        0,
      ),
    ).toBe(8);
  });
  it("does not count awake or in-bed records as sleep", () => {
    const xml = wrap(
      record(
        "HKCategoryTypeIdentifierSleepAnalysis",
        "2026-09-13 22:00:00 +0200",
        "2026-09-14 06:00:00 +0200",
        "HKCategoryValueSleepAnalysisInBed",
      ),
    );
    expect(() => parseAppleXml(xml, now)).toThrow(/No usable/);
  });
  it("converts seconds to milliseconds for HRV", () => {
    const xml = wrap(
      record(
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        "2026-09-14 06:00:00 +0200",
        "2026-09-14 06:00:00 +0200",
        "0.062",
        "s",
      ),
    );
    expect(parseAppleXml(xml, now).daily[0].hrvMs).toBe(62);
  });
  it("rejects malformed XML and non-health XML", () => {
    expect(() => parseAppleXml("<HealthData><oops>", now)).toThrow();
    expect(() => parseAppleXml("<other/>", now)).toThrow(/not an Apple/);
  });
  it("reports malformed JSON", () =>
    expect(() => parseHealthText("{bad", now)).toThrow());
});
