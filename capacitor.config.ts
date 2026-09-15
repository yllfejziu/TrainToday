import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yllfejziu.traintoday",
  appName: "TrainToday",
  webDir: "dist",
  ios: {
    contentInset: "always",
    preferredContentMode: "mobile",
    scheme: "TrainToday",
  },
};

export default config;
