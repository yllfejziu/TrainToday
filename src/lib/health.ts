import { normalizeHealth } from "./import";
import type { HealthData, Provider } from "./types";
export interface HealthBridge {
  isAvailable(provider: Provider): Promise<boolean>;
  requestReadAccess(provider: Provider): Promise<void>;
  readRecent(provider: Provider, days: number): Promise<unknown>;
}
declare global {
  interface Window {
    trainTodayHealth?: HealthBridge;
  }
}
export async function syncHealth(provider: Provider): Promise<HealthData> {
  const bridge = window.trainTodayHealth;
  if (!bridge || !(await bridge.isAvailable(provider)))
    throw Error(
      "Direct sync needs a native companion. In this PWA, import an export from your device instead.",
    );
  await bridge.requestReadAccess(provider);
  return normalizeHealth(await bridge.readRecent(provider, 90));
}
export function importFile(file: File): Promise<HealthData> {
  if (file.size > 100 * 1024 * 1024)
    return Promise.reject(
      Error(
        "Choose an export smaller than 100 MB. For larger Apple exports, filter to the last 90 days with your export tool.",
      ),
    );
  if (!/\.(xml|json)$/i.test(file.name))
    return Promise.reject(
      Error(
        "Choose an XML or JSON file. Unzip Apple’s export first, then choose export.xml.",
      ),
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/import.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        Error("The import took too long. Try an export with fewer records."),
      );
    }, 60000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok) resolve(e.data.data);
      else reject(Error(e.data.error));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(
        Error(
          "The export could not be processed. Your existing data is unchanged.",
        ),
      );
    };
    worker.postMessage(file);
  });
}
