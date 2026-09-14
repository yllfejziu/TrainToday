import { DAY, dateKey } from "./dates";
import type { HealthData, Feeling, Preferences, Recommendation } from "./types";
const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
export function recommend(
  data: HealthData,
  feeling: Feeling,
  prefs: Preferences,
  now = new Date(),
): Recommendation {
  const time = now.getTime(),
    today = dateKey(now);
  const history = data.daily.filter(
    (d) => d.date < today && d.date >= dateKey(new Date(time - 28 * DAY)),
  );
  const currentDays = data.daily
    .filter((d) => d.date === today || d.date === dateKey(new Date(time - DAY)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = (key: "sleepHours" | "hrvMs" | "restingHr") =>
    currentDays.find((d) => d[key] !== undefined)?.[key];
  const baseline = (key: "hrvMs" | "restingHr") => {
    const v = history
      .filter(
        (d) => d.date !== currentDays.find((c) => c[key] !== undefined)?.date,
      )
      .map((d) => d[key])
      .filter((n): n is number => n !== undefined);
    return v.length >= 5 ? mean(v) : undefined;
  };
  const hb = baseline("hrvMs"),
    rb = baseline("restingHr");
  const recent = data.workouts
    .filter((w) => new Date(w.start).getTime() <= time)
    .sort((a, b) => b.start.localeCompare(a.start));
  const week = recent.filter(
    (w) => time - new Date(w.start).getTime() < 7 * DAY,
  );
  const prior = recent.filter((w) => {
    const age = time - new Date(w.start).getTime();
    return age >= 7 * DAY && age < 28 * DAY;
  });
  const estimatedLoad = (w: (typeof recent)[number]) =>
    w.durationMin * (w.effort ?? (w.type === "recovery" ? 2 : 4));
  const loadNow = week.reduce((s, w) => s + estimatedLoad(w), 0),
    loadBefore = prior.reduce((s, w) => s + estimatedLoad(w), 0) / 3;
  const highLoad =
    (prior.length >= 4 && loadNow > loadBefore * 1.35) ||
    week.reduce((s, w) => s + w.durationMin, 0) > 420;
  const sleep = latest("sleepHours"),
    hrv = latest("hrvMs"),
    rhr = latest("restingHr");
  const yesterdaySteps = data.daily.find(
    (d) => d.date === dateKey(new Date(time - DAY)),
  )?.steps;
  const stepHistory = history
    .map((d) => d.steps)
    .filter((n): n is number => n !== undefined);
  const unusuallyActive =
    yesterdaySteps !== undefined &&
    yesterdaySteps >
      Math.max(
        15000,
        stepHistory.length >= 5 ? mean(stepHistory) * 1.5 : 15000,
      );
  const signals = [
    sleep !== undefined,
    hrv !== undefined && hb !== undefined,
    rhr !== undefined && rb !== undefined,
  ].filter(Boolean).length;
  const fresh = signals > 0;
  let points = 82;
  if (sleep !== undefined)
    points += sleep >= 7 ? 0 : sleep >= 6 ? -12 : sleep >= 5 ? -24 : -40;
  if (hrv !== undefined && hb !== undefined)
    points += hrv < hb * 0.7 ? -25 : hrv < hb * 0.85 ? -12 : 0;
  if (rhr !== undefined && rb !== undefined)
    points += rhr > rb + 10 ? -25 : rhr > rb + 5 ? -12 : 0;
  if (highLoad) points -= 18;
  if (unusuallyActive) points -= 10;
  if (feeling === "great") points += 5;
  if (feeling === "tired") points -= 25;
  if (feeling === "sore") points -= 30;
  if (feeling === "unwell") points = 15;
  const score =
    signals >= 2 ? Math.max(10, Math.min(95, Math.round(points))) : null;
  const last = recent[0],
    age = last ? (time - new Date(last.start).getTime()) / DAY : 999;
  const already = recent.some(
    (w) => dateKey(w.start) === today && w.durationMin >= 15,
  );
  const hardYesterday =
    age < 1.5 && last && ((last.effort ?? 0) >= 7 || last.durationMin >= 75);
  const strengthRecently = recent.some(
    (w) =>
      w.type === "strength" && time - new Date(w.start).getTime() < 4 * DAY,
  );
  const recentRuns = week.filter((w) => w.type === "running");
  const priorRuns = recent.filter(
    (w) =>
      w.type === "running" && time - new Date(w.start).getTime() < 28 * DAY,
  );
  const reasons: string[] = [];
  let type: Recommendation["type"] = "running";
  if (
    feeling === "unwell" ||
    (sleep !== undefined && sleep < 5) ||
    (signals >= 2 && points < 38)
  )
    type = "rest";
  else if (
    feeling === "tired" ||
    feeling === "sore" ||
    highLoad ||
    unusuallyActive ||
    hardYesterday ||
    already ||
    !fresh ||
    (signals >= 2 && points < 60)
  )
    type = "recovery";
  else if (recentRuns.length >= 2 && !strengthRecently) type = "strength";
  if (feeling === "unwell")
    reasons.push(
      "You reported feeling unwell or in pain. Skip training today and reassess when you feel better.",
    );
  if (feeling === "tired" || feeling === "sore")
    reasons.push(
      `You’re feeling ${feeling}. Your check-in takes priority over the numbers.`,
    );
  if (already)
    reasons.push(
      "You have already completed a session today. Give that effort time to settle.",
    );
  if (hardYesterday)
    reasons.push(
      "Your most recent session was long or demanding. A lighter day gives you time to recover.",
    );
  if (sleep !== undefined)
    reasons.push(
      sleep >= 7
        ? `${sleep.toFixed(1)} hours of sleep supports a comfortable session.`
        : `${sleep.toFixed(1)} hours of sleep is a reason to keep today gentle.`,
    );
  if (hrv !== undefined && hb !== undefined)
    reasons.push(
      hrv >= hb * 0.85
        ? `Your HRV is close to your personal baseline (${Math.round(hb)} ms).`
        : `Your HRV is below your recent baseline (${Math.round(hb)} ms).`,
    );
  if (rhr !== undefined && rb !== undefined && rhr > rb + 5)
    reasons.push(
      `Resting heart rate is ${Math.round(rhr - rb)} bpm above your usual level.`,
    );
  if (unusuallyActive)
    reasons.push(
      "Yesterday’s step count was unusually high. Everyday activity counts toward recovery too.",
    );
  if (highLoad)
    reasons.push(
      "Recent training load is elevated. An easier day helps you absorb the work.",
    );
  if (type === "strength")
    reasons.push(
      "You’ve run at least twice this week, with no strength session in the last four days. Time to balance the mix.",
    );
  if (!fresh)
    reasons.push(
      "Recent recovery data is missing or older than yesterday. Start gently, based on how you feel.",
    );
  else if (signals < 2)
    reasons.push(
      "Recovery data is limited, so this is a cautious suggestion, without a readiness score.",
    );
  if (!highLoad && !hardYesterday && !already)
    reasons.push(
      `${week.length} sessions in the last seven days${prior.length >= 4 ? " fit a manageable recent load" : "; more history will help personalize your training"}.`,
    );
  const usualDuration = priorRuns.length
    ? mean(priorRuns.slice(0, 5).map((w) => w.durationMin))
    : 20;
  const cap =
    signals < 2
      ? 20
      : Math.max(20, Math.min(45, Math.floor(usualDuration / 5) * 5));
  const duration =
    type === "rest"
      ? 0
      : Math.max(
          10,
          Math.min(
            prefs.availableMin,
            type === "recovery" ? 20 : type === "strength" ? 30 : cap,
          ),
        );
  const runsWithDistance = priorRuns.filter(
    (w) => w.distanceKm && w.distanceKm > 0,
  );
  const pace = runsWithDistance.length
    ? mean(
        runsWithDistance.slice(0, 5).map((w) => w.durationMin / w.distanceKm!),
      )
    : undefined;
  const distanceKm =
    type === "running" && pace
      ? Math.floor((duration / Math.max(5, pace)) * 2) / 2
      : undefined;
  const titles = {
    running: ["Easy miles.", "Good energy."],
    strength: ["Build strength.", "Find balance."],
    recovery: ["Take it easy.", "Keep moving."],
    rest: ["Rest is part", "of the plan."],
  };
  const descriptions = {
    running: priorRuns.length
      ? "Keep it comfortable today and build your aerobic base. You should be able to speak in full sentences."
      : "Start with a gentle run–walk. Alternate one minute of easy jogging with two minutes of walking.",
    strength:
      "A little strength goes a long way. Move with control and finish each set with a few reps left.",
    recovery:
      "Make a little space for recovery. A relaxed walk and gentle mobility are plenty for today.",
    rest: "Give yourself permission to recharge. Skip the workout and make room for sleep and recovery.",
  };
  const steps =
    type === "running"
      ? [
          {
            title: "Ease into it",
            duration: 5,
            detail: "Walk briskly, then ease into a very gentle jog.",
          },
          {
            title: priorRuns.length
              ? "Find your easy rhythm"
              : "Run a little, walk a little",
            duration: duration - 10,
            detail: priorRuns.length
              ? "Run at an effort of 3–4 out of 10. Stay relaxed; slow down when talking gets difficult."
              : "Alternate 1 minute of easy jogging with 2 minutes of walking. Walking the whole time is okay.",
          },
          {
            title: "Bring it home",
            duration: 5,
            detail: "Slow to a walk. Let your breathing settle.",
          },
        ]
      : type === "strength"
        ? [
            {
              title: "Warm up",
              duration: 5,
              detail:
                "March in place, circle your arms, and practice a few slow bodyweight squats.",
            },
            {
              title: "Full-body circuit",
              duration: duration - 10,
              detail:
                "2–3 rounds: 8 chair squats, 8 incline push-ups, 10 glute bridges, and a 20-second plank. Rest 60–90 seconds between rounds. Stop 2–3 reps before failure.",
            },
            {
              title: "Reset",
              duration: 5,
              detail:
                "Walk gently and loosen up. Skip any movement that hurts.",
            },
          ]
        : type === "recovery"
          ? [
              {
                title: "A little fresh air",
                duration: duration - 5,
                detail:
                  "Take a relaxed walk at 1–2 out of 10 effort. There is no pace or distance target.",
              },
              {
                title: "Unwind",
                duration: 5,
                detail:
                  "Gentle ankle circles, shoulder rolls, and comfortable mobility. Avoid painful stretches.",
              },
            ]
          : [
              {
                title: "Let recovery happen",
                duration: 0,
                detail:
                  "No structured workout today. Eat regularly, drink to thirst, and give yourself a full night’s sleep.",
              },
            ];
  return {
    type,
    title: titles[type],
    description: descriptions[type],
    durationMin: duration,
    distanceKm,
    intensity:
      type === "rest"
        ? "Rest"
        : type === "strength"
          ? "Moderate"
          : type === "recovery"
            ? "Gentle"
            : "Easy",
    effort:
      type === "rest"
        ? 0
        : type === "strength"
          ? 5
          : type === "recovery"
            ? 2
            : 4,
    score,
    readiness:
      type === "rest"
        ? "Time to recharge"
        : type === "recovery"
          ? "Keep it gentle"
          : "Ready to move",
    confidence: signals >= 2 ? "Readiness estimate" : "Limited data",
    reasons,
    steps,
    sleep,
    hrv,
    hrvBaseline: hb,
    restingHr: rhr,
    restingBaseline: rb,
    weeklySessions: week.length,
    weeklyMinutes: Math.round(week.reduce((s, w) => s + w.durationMin, 0)),
    load: highLoad ? "high" : week.length < 2 ? "light" : "balanced",
    fresh,
  };
}
