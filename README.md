# TrainToday

A focused iPhone training companion that answers **“What should I do today?”** with running, strength training, active recovery, or rest. Concrete plans, a daily check-in, and recent Apple Health activities keep the experience useful at a glance. The hosted web build is a sample-data preview.

## Development

Requires Node 22 and npm.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
npm run ios:sync
npm run ios:open
```

## Architecture

Following the HM Prep project: React 19 + TypeScript + Vite for the UI and Capacitor for the native iOS shell. Training rules and HealthKit payload validation are independent of UI components and covered by unit tests.

- `src/lib/recommendation.ts`: deterministic readiness and prescription rules.
- `ios/App/App/HealthKitPlugin.swift`: read-only HealthKit permission and queries.
- `src/lib/health.ts`: typed Capacitor bridge for the native HealthKit plugin.
- `src/lib/normalizeHealth.ts`: validates native data before it reaches the recommendation engine.
- `src/hooks/useHealth.ts`: device-local state and storage failure handling.
- `src/components`: dialogs and activity views.

Health records are read and processed on the iPhone and stored in the app’s local WebView storage. There is no backend, account system, analytics, or external AI call. Sample data is labeled and separate from personal data. Preferences, check-ins, and plans persist locally.

## Health integration status

**Working now:** native Apple Health authorization and synchronization, activity browsing and filtering, manual session logging, recent recovery metrics and training load, personal baseline comparisons, daily check-ins, and offline assets.

The iPhone app requests read access to workouts, sleep, HRV, resting heart rate, heart rate, steps, and distance. It requests no write access. See [`docs/healthkit.md`](docs/healthkit.md) for the data contract and device setup.

The native query keeps the most recent 90 days. On-device timezone is used for daily summaries, and overlapping sleep stages are merged before total sleep is calculated. Missing or unshared values remain missing.

## Readiness rules and limitations

The readiness number is a **rule-based estimate, not a clinically validated score**. HRV and resting HR are compared with 5 or more prior daily values in the previous 28 days. Recent values come from today or yesterday. The rules use sleep, recovery trends, estimated training load, unusually high steps, recent hard sessions, and the user’s daily check-in. Missing metrics remain missing; insufficient data removes the score and limits training. Illness, pain, very short sleep, and poor recovery favor rest. A completed session today favors recovery.

Training load uses duration × reported effort; unknown effort defaults to 4/10 (2/10 for recovery). Previous 21-day average weekly load is compared with the latest week only when enough sessions exist. Running prescriptions use recent running history and available time, with easy conversational effort. No race, pace, or heart-rate-zone performance claims are inferred from sparse data.

Provider references:

- [Apple HealthKit](https://developer.apple.com/documentation/healthkit)
- [Health Connect setup](https://developer.android.com/health-and-fitness/health-connect/get-started)
- [CDC: measuring activity intensity](https://www.cdc.gov/physical-activity-basics/measuring/index.html)

## Web preview on Vercel

`vercel.json` configures a Vite static deployment: `npm ci`, `npm run build`, output `dist`. Hash navigation works without blanket rewrites; service workers and manifests are revalidated, and hashed assets are cached immutably. No environment variables are required.

The production preview is deployed from `main` at [traintoday.vercel.app](https://traintoday.vercel.app). Browsers cannot access HealthKit, so the hosted version clearly remains in sample mode. Use the signed iOS build on a physical iPhone to test Apple Health permissions and personal data.
