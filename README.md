# TrainToday

A small, installable training companion that answers **“What should I do today?”** with running, strength training, active recovery, or rest. Concrete plans, a daily check-in, and recent activities keep the experience focused.

## Development

Requires Node 22 and npm.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## Architecture

Following the HM Prep project: React 19 + TypeScript + Vite, with `vite-plugin-pwa` for an installable offline app. Training rules and import normalization are independent of UI components and covered by unit tests.

- `src/lib/recommendation.ts`: deterministic readiness and prescription rules.
- `src/lib/import.ts`: validated normalized JSON and Apple Health XML parsing.
- `src/workers/import.worker.ts`: imports off the main UI thread.
- `src/lib/health.ts`: file import and native companion adapter boundary.
- `src/hooks/useHealth.ts`: device-local state and storage failure handling.
- `src/components`: dialogs and activity views.

Health records are processed locally and stored in this browser’s local storage. There is no backend, account system, analytics, or external AI call. Sample data is labeled and separate from personal data. Preferences, check-ins, and plans persist locally. Imports replace the existing snapshot; export a backup before replacement if you have manually logged sessions to retain.

## Health integration status

**Working now:** Apple Health `export.xml` import, normalized JSON import, activity browsing and filtering, manual session logging, recent recovery metrics and training load, personal baseline comparisons, daily check-ins, and PWA installation/offline assets.

**Not implemented:** a native iOS/Android companion and automatic HealthKit/Health Connect synchronization. A PWA cannot directly request native HealthKit or Health Connect permissions. The interface explains this rather than showing a fake connection. The adapter in `docs/health-bridge.md` is the integration contract for that future companion.

Apple: Health → profile → Export All Health Data → unzip → choose `apple_health_export/export.xml` in the app. XML and JSON files up to 100 MB are supported, with the last 90 days retained. On-device timezone is used for daily summaries; overlapping sleep stages are merged and nighttime segments are assigned to the morning. For duplicate step sources, the source with the greatest daily total is used to avoid adding phone and watch totals together. This is an approximation of Health’s own source-priority logic.

## Readiness rules and limitations

The readiness number is a **rule-based estimate, not a clinically validated score**. HRV and resting HR are compared with 5 or more prior daily values in the previous 28 days. Recent values come from today or yesterday. The rules use sleep, recovery trends, estimated training load, unusually high steps, recent hard sessions, and the user’s daily check-in. Missing metrics remain missing; insufficient data removes the score and limits training. Illness, pain, very short sleep, and poor recovery favor rest. A completed session today favors recovery.

Training load uses duration × reported effort; unknown effort defaults to 4/10 (2/10 for recovery). Previous 21-day average weekly load is compared with the latest week only when enough sessions exist. Running prescriptions use recent running history and available time, with easy conversational effort. No race, pace, or heart-rate-zone performance claims are inferred from sparse data.

Provider references:

- [Apple HealthKit](https://developer.apple.com/documentation/healthkit)
- [Health Connect setup](https://developer.android.com/health-and-fitness/health-connect/get-started)
- [CDC: measuring activity intensity](https://www.cdc.gov/physical-activity-basics/measuring/index.html)

## Deploy to Vercel

`vercel.json` configures a Vite static deployment: `npm ci`, `npm run build`, output `dist`. Hash navigation works without blanket rewrites; service workers and manifests are revalidated, and hashed assets are cached immutably. No environment variables are required.

Connect `yllfejziu/TrainToday` in Vercel and use the repository root. Deployments need HTTPS for PWA installation. In Safari on iPhone, use Share → Add to Home Screen. In Chrome on Android, use the browser’s Install app action. Open the app once while online so it can cache its assets, then check offline mode. Health imports remain local to each browser/device and do not sync between them.
