import { Capacitor, registerPlugin } from "@capacitor/core";
import { normalizeHealth } from "./normalizeHealth";
import type { HealthData } from "./types";

interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ authorized: boolean }>;
  readRecent(options: { days: number }): Promise<unknown>;
}

const HealthKit = registerPlugin<HealthKitPlugin>("HealthKit");

export function isNativeHealthAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function syncHealth(): Promise<HealthData> {
  if (!isNativeHealthAvailable())
    throw Error(
      "Apple Health access is available in the TrainToday iPhone app.",
    );
  const availability = await HealthKit.isAvailable();
  if (!availability.available)
    throw Error("Apple Health is not available on this device.");
  const permission = await HealthKit.requestAuthorization();
  if (!permission.authorized)
    throw Error("Apple Health permission was not completed.");
  return normalizeHealth(await HealthKit.readRecent({ days: 90 }));
}
