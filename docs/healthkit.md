# Apple Health integration

TrainToday ships as a Capacitor iOS app. Health data is read through the local `HealthKit` Capacitor plugin in `ios/App/App/HealthKitPlugin.swift`; the web layer calls it from `src/lib/health.ts`.

The app requests read access to workouts, sleep analysis, heart-rate variability (SDNN), resting heart rate, heart rate, step count, and walking/running and cycling distance. It requests no write access. Data stays inside the app and is saved in its WebView storage for quick startup and offline use.

The native bridge returns a versioned payload with up to 90 days of data. Workout timestamps are ISO 8601, duration is in minutes, distance is in kilometers, heart rate is bpm, and HRV is milliseconds. Daily dates use the iPhone’s current calendar and timezone. Missing or denied data types are omitted rather than replaced with zero.

HealthKit deliberately does not tell apps whether read access for an individual data type was denied. A successful authorization request means the system sheet completed; an empty result may still mean the user withheld access. The UI therefore explains how to review access in Settings instead of claiming every category was granted.

## Run on an iPhone

1. Run `npm run ios:sync`.
2. Run `npm run ios:open`.
3. In Xcode, select the **App** target, then **Signing & Capabilities** and choose your Apple Developer team.
4. Connect and trust the iPhone, select it as the run destination, and press Run.
5. In TrainToday, tap **Connect Apple Health** and choose the categories to share.

The simulator can compile the integration but does not provide a useful test of a real Health history. Use a physical iPhone for permission and data verification.
