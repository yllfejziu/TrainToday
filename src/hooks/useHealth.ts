import { useState } from "react";
import { makeDemo } from "../data/demo";
import { dateKey } from "../lib/dates";
import { normalizeHealth } from "../lib/normalizeHealth";
import type { HealthData, CheckIn, Preferences, Workout } from "../lib/types";
const KEY = "traintoday:v1";
export interface SavedPlan {
  date: string;
  type: string;
}
interface Store {
  mode: "demo" | "personal";
  data: HealthData | null;
  checkIn: CheckIn | null;
  prefs: Preferences;
  savedPlan: SavedPlan | null;
}
const defaults: Store = {
  mode: "demo",
  data: null,
  checkIn: null,
  prefs: { units: "km", availableMin: 30 },
  savedPlan: null,
};
function load(): { state: Store; error: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: defaults, error: "" };
    const v = JSON.parse(raw);
    if (!["demo", "personal"].includes(v.mode)) throw Error();
    const prefs: Preferences = {
      units: v.prefs?.units === "mi" ? "mi" : "km",
      availableMin: [20, 30, 45, 60].includes(v.prefs?.availableMin)
        ? v.prefs.availableMin
        : 30,
    };
    const checkIn =
      v.checkIn &&
      typeof v.checkIn.date === "string" &&
      ["great", "good", "tired", "sore", "unwell"].includes(v.checkIn.feeling)
        ? v.checkIn
        : null;
    let data = null;
    if (v.data) {
      // Validate stored data without silently turning expired personal data into demo data.
      data = normalizeHealth(v.data, new Date(v.data.importedAt));
      data.importedAt = v.data.importedAt;
    }
    return {
      state: {
        mode: v.mode,
        data,
        prefs,
        checkIn,
        savedPlan: v.savedPlan?.date && v.savedPlan?.type ? v.savedPlan : null,
      },
      error: "",
    };
  } catch {
    return {
      state: { ...defaults, mode: "personal" },
      error:
        "Saved health data could not be read. Please connect Apple Health again.",
    };
  }
}
export function useHealth(now: Date) {
  const [initial] = useState(load);
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
  function update(patch: Partial<Store>) {
    const next = { ...state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setState(next);
      setError("");
      return true;
    } catch {
      setError(
        "Your browser could not save this change. Free some storage or use a regular browser window.",
      );
      return false;
    }
  }
  const data =
    state.mode === "demo"
      ? makeDemo(now)
      : (state.data ?? {
          version: 1 as const,
          provider: "TrainToday" as const,
          importedAt: now.toISOString(),
          workouts: [],
          daily: [],
        });
  function importData(d: HealthData) {
    return update({ mode: "personal", data: d, savedPlan: null });
  }
  function logWorkout(w: Workout) {
    const next = { ...data, workouts: [w, ...data.workouts] };
    if (state.mode === "demo") return false;
    return update({ data: next, savedPlan: null });
  }
  return {
    state,
    data,
    error,
    setError,
    update,
    importData,
    logWorkout,
    feeling:
      state.checkIn?.date === dateKey(now)
        ? state.checkIn.feeling
        : ("good" as const),
    clear: () =>
      update({ mode: "personal", data: null, checkIn: null, savedPlan: null }),
    demo: () =>
      update({ mode: "demo", data: null, checkIn: null, savedPlan: null }),
  };
}
