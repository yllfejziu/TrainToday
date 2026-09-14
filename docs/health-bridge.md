# Native health companion contract

The PWA does not have native HealthKit or Health Connect access. A future trusted native shell may install `window.trainTodayHealth` before rendering. Do not expose this bridge to arbitrary websites or navigation; only load the app’s trusted bundled origin. Reading is user-initiated through the import dialog. No write permissions are required.

```ts
interface HealthBridge {
  isAvailable(
    provider: "Apple Health" | "Health Connect" | "TrainToday",
  ): Promise<boolean>;
  requestReadAccess(
    provider: "Apple Health" | "Health Connect" | "TrainToday",
  ): Promise<void>;
  readRecent(
    provider: "Apple Health" | "Health Connect" | "TrainToday",
    days: number,
  ): Promise<unknown>;
}
```

`readRecent` returns the same JSON format accepted by file import:

```json
{
  "version": 1,
  "provider": "Health Connect",
  "importedAt": "2026-09-14T08:00:00Z",
  "workouts": [
    {
      "id": "provider-stable-workout-id",
      "type": "running",
      "title": "Morning run",
      "start": "2026-09-13T06:00:00Z",
      "durationMin": 30,
      "distanceKm": 5,
      "heartRate": 138,
      "effort": 4,
      "source": "Health Connect"
    }
  ],
  "daily": [
    {
      "date": "2026-09-14",
      "sleepHours": 7.8,
      "hrvMs": 62,
      "restingHr": 52,
      "steps": 1500
    }
  ]
}
```

Workout types: `running`, `strength`, `recovery`, `cycling`, `other`. All timestamps must include an offset or `Z`. Daily dates use the user’s local calendar. Duration is minutes, distance is kilometers, HRV is milliseconds, heart rate is bpm, effort is 1–10. Optional metrics must be omitted when unavailable. Do not fill unavailable values with zero. Providers should deduplicate their records and return sleep duration without overlapping stage totals. The client validates inputs again and discards data older than 90 days or in the future.

The example in the app is generated relative to today so it remains usable for testing. Importing it is a deliberate sample-format test, not proof of a device connection. An arbitrary Android ZIP, Google Fit Takeout export, or third-party JSON format is not supported without conversion to this schema.

HealthKit read permission denials can appear as missing data. A native implementation must not claim full authorization from an empty result. Handle unavailable sensors and partial permission grants by omitting the missing metrics. Request only workouts, sleep, HRV, resting heart rate, and activity/steps needed by this app.
