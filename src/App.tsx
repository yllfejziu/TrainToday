import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  Activity,
  Footprints,
  Moon,
  Heart,
  MoveUpRight,
  Sparkles,
  Settings2,
  ShieldCheck,
  Check,
  Clock3,
  Dumbbell,
  Leaf,
  Cloud,
  Info,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useHealth } from "./hooks/useHealth";
import { recommend } from "./lib/recommendation";
import { dateKey, distance, sleepTime, activityDate, DAY } from "./lib/dates";
import { activityMeta, type Feeling, type Workout } from "./lib/types";
import { isNativeHealthAvailable, syncHealth } from "./lib/health";
import Dialog from "./components/Dialog";
import { ActivityList, ActivityRow } from "./components/Activities";

type Modal = "plan" | "why" | "data" | "settings" | "log" | null;
const feelings: { id: Feeling; label: string; emoji: string }[] = [
  { id: "great", label: "Great", emoji: "⚡" },
  { id: "good", label: "Good", emoji: "🙂" },
  { id: "tired", label: "Tired", emoji: "🪫" },
  { id: "sore", label: "Sore", emoji: "🛌" },
];
export default function App() {
  const [now, setNow] = useState(() => new Date());
  const health = useHealth(now),
    { state, data, feeling } = health,
    demo = state.mode === "demo";
  const [page, setPage] = useState(
    location.hash === "#activities" ? "activities" : "today",
  );
  const [modal, setModal] = useState<Modal>(null),
    [selected, setSelected] = useState<Workout | null>(null);
  const [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [healthError, setHealthError] = useState(""),
    [confirmClear, setConfirmClear] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const nativeHealth = isNativeHealthAvailable();
  const rec = recommend(data, feeling, state.prefs, now);
  const meta = activityMeta[rec.type];
  const isSaved =
    state.savedPlan?.date === dateKey(now) &&
    state.savedPlan?.type === rec.type;
  const Icon =
    rec.type === "running"
      ? Footprints
      : rec.type === "strength"
        ? Dumbbell
        : rec.type === "recovery"
          ? Leaf
          : Cloud;
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60000);
    const update = () => {
      setNow(new Date());
      setOnline(navigator.onLine);
    };
    const hash = () =>
      setPage(location.hash === "#activities" ? "activities" : "today");
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(tick);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const registry = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!registry) return;
    const lifecycle = new AbortController();
    const tool = {
      name: "navigate_training_view",
      title: "Open a training view",
      description:
        "Open Today or Activities in TrainToday. This changes only the visible page and does not expose health data.",
      inputSchema: {
        type: "object",
        properties: { view: { type: "string", enum: ["today", "activities"] } },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const v = input as { view?: unknown };
        if (
          !v ||
          typeof v !== "object" ||
          !["today", "activities"].includes(String(v.view)) ||
          Object.keys(v).some((k) => k !== "view")
        )
          throw Error("Choose today or activities.");
        location.hash = String(v.view);
        setPage(String(v.view));
        return { view: v.view };
      },
    };
    try {
      void Promise.resolve(
        registry.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, []);
  function navigate(view: string) {
    location.hash = view;
    setPage(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function checkIn(value: Feeling) {
    if (
      health.update({
        checkIn: { date: dateKey(now), feeling: value },
        savedPlan: null,
      })
    )
      setToast("Check-in saved. Your plan is up to date.");
  }
  async function sync() {
    setBusy(true);
    setHealthError("");
    try {
      const result = await syncHealth();
      if (health.importData(result)) {
        setNow(new Date());
        setToast(
          `${result.workouts.length} activities synced from Apple Health.`,
        );
        setModal(null);
      }
    } catch (e) {
      setHealthError(
        e instanceof Error ? e.message : "Could not sync your data.",
      );
    } finally {
      setBusy(false);
    }
  }
  function savePlan() {
    if (health.update({ savedPlan: { date: dateKey(now), type: rec.type } })) {
      setToast(
        rec.type === "rest"
          ? "Rest day saved. Take good care of yourself."
          : "Your plan is saved for today.",
      );
      setModal(null);
    }
  }
  function logSession(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const minutes = Number(form.get("minutes")),
      effort = Number(form.get("effort"));
    const entered = String(form.get("distance") || "");
    const km = entered
      ? Number(entered) * (state.prefs.units === "mi" ? 1.609344 : 1)
      : undefined;
    if (
      !Number.isFinite(minutes) ||
      minutes < 1 ||
      minutes > 600 ||
      !Number.isFinite(effort) ||
      effort < 1 ||
      effort > 10 ||
      (km !== undefined && (!Number.isFinite(km) || km < 0 || km > 200))
    )
      return;
    const end = new Date();
    const workout: Workout = {
      id: crypto.randomUUID(),
      type: rec.type === "rest" ? "recovery" : rec.type,
      title:
        rec.type === "strength"
          ? "Full-body strength"
          : rec.type === "running"
            ? "Easy run"
            : "Recovery walk",
      start: new Date(end.getTime() - minutes * 60000).toISOString(),
      durationMin: minutes,
      distanceKm: km,
      effort,
      source: "TrainToday · manual",
    };
    if (health.logWorkout(workout)) {
      setNow(end);
      setModal(null);
      setToast("Session logged. Time to enjoy the recovery.");
    }
  }
  const hrvSteady =
    rec.hrv !== undefined &&
    rec.hrvBaseline !== undefined &&
    rec.hrv >= rec.hrvBaseline * 0.85;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <a className="brand" href="#today" aria-label="TrainToday home">
          <span className="brand-mark" aria-hidden="true">
            t<span>t</span>
          </span>
          train<span>today</span>
          <i>®</i>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={`nav-link ${page === "today" ? "active" : ""}`}
            aria-current={page === "today" ? "page" : undefined}
            onClick={() => navigate("today")}
          >
            Today
          </button>
          <button
            className={`nav-link ${page === "activities" ? "active" : ""}`}
            aria-current={page === "activities" ? "page" : undefined}
            onClick={() => navigate("activities")}
          >
            Activities
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="source-button"
            onClick={() => {
              setHealthError("");
              setModal("data");
            }}
          >
            <Heart size={16} fill="currentColor" />
            <span>
              {demo
                ? "Sample data"
                : data.workouts.length || data.daily.length
                  ? "Your health data"
                  : "Connect Apple Health"}
            </span>
            <ChevronRight size={13} />
          </button>
          <button
            className="avatar settings-button"
            aria-label="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>
      <main id="main">
        {!online && (
          <div className="notice offline">
            <span>
              ☁️ You’re offline. Your saved data and plan are still here.
            </span>
          </div>
        )}
        {health.error && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            {health.error}
            <button
              onClick={() => health.setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              {page === "today"
                ? "YOUR DAILY TRAINING COMPANION"
                : "YOUR TRAINING JOURNAL"}
            </div>
            <h1>
              {page === "today"
                ? rec.type === "rest"
                  ? "A good day to recharge"
                  : rec.type === "recovery"
                    ? "A little gentler today"
                    : "A good day to move"
                : "Every move counts"}
              <span>
                {" "}
                {page === "activities"
                  ? "👟"
                  : rec.type === "rest"
                    ? "☁️"
                    : rec.type === "recovery"
                      ? "🌿"
                      : "☀️"}
              </span>
            </h1>
            <p>
              {page === "today"
                ? "Listen to your body. Make today count."
                : "The work you’ve put in, all in one place."}
            </p>
          </div>
          <div className="date-label">
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
        {page === "today" ? (
          <>
            <div className="today-grid">
              <section
                className={`recommendation ${rec.type}`}
                aria-labelledby="recommendation-title"
              >
                <div className="card-top">
                  <span className="eyebrow">
                    <span className="status-dot" />
                    TODAY’S RECOMMENDATION
                  </span>
                  <span className="pill">
                    {rec.readiness} <ArrowUpRight size={14} />
                  </span>
                </div>
                <div className="hero-content">
                  <span className="activity-label">
                    <Icon size={17} />
                    {meta.label.toUpperCase()}
                  </span>
                  <h2 id="recommendation-title">
                    {rec.title[0]}
                    <br />
                    {rec.title[1]}
                  </h2>
                  <p>{rec.description}</p>
                </div>
                <div className="prescription">
                  <div>
                    <strong>
                      {rec.type === "rest"
                        ? "Off"
                        : rec.distanceKm
                          ? distance(rec.distanceKm, state.prefs.units)
                          : rec.type === "strength"
                            ? "2–3"
                            : "Easy"}
                      {rec.distanceKm && <small> {state.prefs.units}</small>}
                    </strong>
                    <span>
                      {rec.type === "rest"
                        ? "Training today"
                        : rec.distanceKm
                          ? "Approx. distance"
                          : rec.type === "strength"
                            ? "Circuit rounds"
                            : "No distance target"}
                    </span>
                  </div>
                  <div>
                    <strong>
                      {rec.type === "rest" ? "You" : rec.durationMin}
                      {rec.type !== "rest" && <small> min</small>}
                    </strong>
                    <span>
                      {rec.type === "rest" ? "Come first" : "Total duration"}
                    </span>
                  </div>
                  <div>
                    <strong>{rec.intensity}</strong>
                    <span>
                      {rec.type === "running"
                        ? "Conversational pace"
                        : rec.type === "rest"
                          ? "No workout needed"
                          : `Effort ${rec.effort} / 10`}
                    </span>
                  </div>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setModal("plan")}
                >
                  {isSaved ? (
                    <>
                      <Check size={18} /> View your saved plan
                    </>
                  ) : (
                    <>
                      Let’s see the plan <MoveUpRight size={19} />
                    </>
                  )}
                </button>
                <div className="hero-footnote">
                  {demo
                    ? "Sample recommendation · try a check-in below"
                    : "A little consistency goes a long way."}
                </div>
              </section>
              <aside className="readiness-card">
                <div className="section-label">
                  Your body, today{" "}
                  <button
                    aria-label="How readiness works"
                    className="icon-button small"
                    onClick={() => setModal("why")}
                  >
                    <Sparkles size={19} />
                  </button>
                </div>
                <div className="readiness-summary">
                  <button
                    className={`readiness-ring ${rec.type}`}
                    style={
                      {
                        "--progress": `${(rec.score ?? 0) * 3.6}deg`,
                      } as CSSProperties
                    }
                    aria-label={`${rec.score ?? "No"} readiness estimate. See explanation`}
                    onClick={() => setModal("why")}
                  >
                    <strong>
                      {rec.score ?? "—"}
                      <span>
                        {rec.score !== null ? "/ 100" : "more data needed"}
                      </span>
                    </strong>
                  </button>
                  <div>
                    <span className="pill pale">
                      {rec.score === null
                        ? "Getting to know you"
                        : rec.score >= 75
                          ? "Looking good"
                          : rec.score >= 50
                            ? "Take it gently"
                            : "Recovery first"}
                    </span>
                    <p>
                      {rec.type === "running" || rec.type === "strength" ? (
                        <>
                          You’ve got room
                          <br />
                          to move today.
                        </>
                      ) : (
                        <>
                          A lighter day
                          <br />
                          can do you good.
                        </>
                      )}
                    </p>
                    <button
                      className="micro-link"
                      onClick={() => setModal("why")}
                    >
                      {rec.confidence} <Info size={12} />
                    </button>
                  </div>
                </div>
                <button className="metric" onClick={() => setModal("why")}>
                  <span className="metric-icon lavender">
                    <Moon size={19} />
                  </span>
                  <span>
                    <b>
                      {rec.sleep === undefined
                        ? "Sleep data is missing"
                        : rec.sleep >= 7
                          ? "A solid night’s sleep"
                          : "Make room for more sleep"}
                    </b>
                    <span>
                      {rec.sleep === undefined
                        ? "Connect Apple Health to add sleep"
                        : sleepTime(rec.sleep)}{" "}
                      <em>
                        {rec.sleep !== undefined
                          ? rec.sleep >= 7
                            ? "· well rested"
                            : "· keep today light"
                          : ""}
                      </em>
                    </span>
                  </span>
                  <ChevronRight size={14} className="metric-check" />
                </button>
                <button className="metric" onClick={() => setModal("why")}>
                  <span className="metric-icon pink">
                    <Heart size={19} />
                  </span>
                  <span>
                    <b>
                      {rec.hrv === undefined
                        ? "Recovery data is missing"
                        : rec.hrvBaseline === undefined
                          ? "Learning your baseline"
                          : hrvSteady
                            ? "Recovery looks steady"
                            : "Recovery needs attention"}
                    </b>
                    <span>
                      {rec.hrv === undefined
                        ? "Connect Apple Health to add recovery"
                        : `HRV ${Math.round(rec.hrv)} ms`}{" "}
                      <em>{hrvSteady ? "· near your usual" : ""}</em>
                    </span>
                  </span>
                  <ChevronRight size={14} className="metric-check" />
                </button>
                <button className="metric" onClick={() => setModal("why")}>
                  <span className="metric-icon peach">
                    <Activity size={19} />
                  </span>
                  <span>
                    <b>
                      {rec.load === "high"
                        ? "Training load is elevated"
                        : rec.load === "light"
                          ? "Room to build gradually"
                          : "Training is balanced"}
                    </b>
                    <span>
                      {rec.weeklySessions} sessions{" "}
                      <em>· in the last 7 days</em>
                    </span>
                  </span>
                  <ChevronRight size={14} className="metric-check" />
                </button>
                <div className="readiness-note">
                  {demo
                    ? "Based on sample health data"
                    : rec.fresh
                      ? "Small signals. A clearer next step."
                      : "Limited recent data · a cautious plan"}
                </div>
              </aside>
            </div>
            <section className="check-in">
              <div>
                <span className="check-icon">✌️</span>
                <div>
                  <h3>How are you feeling?</h3>
                  <p>
                    You know your body best. Your check-in shapes today’s plan.
                  </p>
                </div>
              </div>
              <div className="feeling-options" aria-label="Daily check-in">
                {feelings.map((f) => (
                  <button
                    key={f.id}
                    className={feeling === f.id ? "selected" : ""}
                    aria-pressed={feeling === f.id}
                    onClick={() => checkIn(f.id)}
                  >
                    {f.emoji} {f.label}
                  </button>
                ))}
              </div>
            </section>
            <div className="check-in-bottom">
              <span>
                {state.checkIn?.date === dateKey(now)
                  ? "Check-in saved for today"
                  : "A fresh start, every day."}
              </span>
              <button
                className={feeling === "unwell" ? "unwell selected" : "unwell"}
                aria-pressed={feeling === "unwell"}
                onClick={() =>
                  checkIn(feeling === "unwell" ? "good" : "unwell")
                }
              >
                {feeling === "unwell"
                  ? "✓ Resting — feeling unwell"
                  : "In pain or feeling unwell?"}
              </button>
            </div>
            <section className="activities-section">
              <div className="section-heading">
                <div>
                  <h3>Your recent moves</h3>
                  <span>A little effort, adding up.</span>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("activities")}
                >
                  All activities <ArrowUpRight size={17} />
                </button>
              </div>
              {data.workouts.length ? (
                data.workouts
                  .slice(0, 3)
                  .map((w) => (
                    <ActivityRow
                      key={w.id}
                      workout={w}
                      units={state.prefs.units}
                      demo={demo}
                      onSelect={setSelected}
                      now={now}
                    />
                  ))
              ) : (
                <div className="empty-state compact">
                  <span>👟</span>
                  <h3>Your next chapter starts here</h3>
                  <p>
                    Connect Apple Health to get a more personal recommendation.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => setModal("data")}
                  >
                    Connect Apple Health <ArrowUpRight size={16} />
                  </button>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="full-activities">
            <div className="activity-summary">
              <div>
                <Activity size={19} />
                <strong>{rec.weeklySessions}</strong>
                <span>sessions this week</span>
              </div>
              <div>
                <Clock3 size={19} />
                <strong>{rec.weeklyMinutes}</strong>
                <span>minutes moving</span>
              </div>
              <button
                className="secondary-button"
                onClick={() => setModal("data")}
              >
                <Heart size={15} /> Sync Apple Health
              </button>
            </div>
            <ActivityList
              workouts={data.workouts}
              units={state.prefs.units}
              demo={demo}
              onSelect={setSelected}
              now={now}
            />
          </section>
        )}
        <footer>
          Made for the long run. <span>One day at a time.</span>
          <button className="footer-right" onClick={() => setModal("data")}>
            <Heart size={12} /> Apple Health
          </button>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal === "plan" && (
        <Dialog
          title={
            rec.type === "rest" ? "Your recovery day" : "Your plan for today"
          }
          onClose={() => setModal(null)}
        >
          <div className={`plan-banner ${rec.type}`}>
            <span>{meta.emoji}</span>
            <div>
              <h3>{meta.label}</h3>
              <p>
                {rec.type === "rest"
                  ? "A day to recharge"
                  : `${rec.durationMin} minutes · ${rec.intensity.toLowerCase()} effort${rec.distanceKm ? ` · around ${distance(rec.distanceKm, state.prefs.units)} ${state.prefs.units}` : ""}`}
              </p>
            </div>
          </div>
          <p className="dialog-copy">{rec.description}</p>
          <div className="plan-steps">
            {rec.steps.map((step, i) => (
              <div className="plan-step" key={step.title}>
                <span>{i + 1}</span>
                <div>
                  <div>
                    <h3>{step.title}</h3>
                    {step.duration > 0 && <b>{step.duration} min</b>}
                  </div>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="reason-note">
            <Sparkles size={17} />
            <p>{rec.reasons[0]}</p>
          </div>
          <button className="primary-button" onClick={savePlan}>
            {isSaved
              ? "Keep this plan"
              : rec.type === "rest"
                ? "Make today a rest day"
                : "Save today’s plan"}{" "}
            <Check size={17} />
          </button>
          {rec.type !== "rest" && !demo && (
            <button
              className="text-button centered"
              onClick={() => setModal("log")}
            >
              Already done? Log your session <ArrowUpRight size={16} />
            </button>
          )}
          {demo && (
            <p className="fine-print">
              You’re exploring a sample plan. Connect Apple Health in the iPhone
              app to use your own data.
            </p>
          )}
        </Dialog>
      )}
      {modal === "why" && (
        <Dialog title="Why this plan?" onClose={() => setModal(null)}>
          <p className="dialog-copy">
            Your body’s signals, recent training, and how you feel come together
            in one simple suggestion.
          </p>
          <ul className="reason-list">
            {rec.reasons.map((r) => (
              <li key={r}>
                <Check size={16} />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <div className="insight-pair">
            <div>
              <span>Resting heart rate</span>
              <b>
                {rec.restingHr === undefined
                  ? "Not available"
                  : `${Math.round(rec.restingHr)} bpm`}
              </b>
              <small>
                {rec.restingBaseline
                  ? `Usual: ${Math.round(rec.restingBaseline)} bpm`
                  : "Building your baseline"}
              </small>
            </div>
            <div>
              <span>Recent movement</span>
              <b>{rec.weeklyMinutes} min</b>
              <small>Last seven days</small>
            </div>
          </div>
          <div className="method-note">
            <h3>A guide, not a verdict</h3>
            <p>
              The readiness score is a transparent rule-based estimate, not a
              validated medical assessment. HRV and resting heart rate use your
              previous 28 days, with at least five days needed for a baseline.
              Training load estimates combine duration and effort; missing
              effort is estimated.
            </p>
            <p>
              Missing or stale data makes the plan gentler. Stop if movement
              hurts; seek medical advice for concerning symptoms.
            </p>
          </div>
          <button
            className="secondary-button full"
            onClick={() => setModal("data")}
          >
            See your data source <ArrowUpRight size={16} />
          </button>
        </Dialog>
      )}
      {modal === "data" && (
        <Dialog
          title="Connect Apple Health"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <p className="dialog-copy">
            Give TrainToday read-only access to the signals that shape today’s
            recommendation.
          </p>
          <div className="local-note">
            <ShieldCheck size={20} />
            <div>
              <b>Private by design</b>
              <p>
                Your health data is read on your iPhone and kept on this device.
                TrainToday does not upload it or write anything to Apple Health.
              </p>
            </div>
          </div>
          <div className="provider-card">
            <span className="provider-icon apple">
              <Heart fill="currentColor" size={22} />
            </span>
            <div>
              <h3>Apple Health</h3>
              <p>
                Workouts, sleep, HRV, resting heart rate, steps, and distance
              </p>
            </div>
            <span className="tiny-badge">READ ONLY</span>
          </div>
          <button
            className="primary-button"
            disabled={busy || !nativeHealth}
            onClick={() => void sync()}
          >
            <Heart size={18} fill="currentColor" />
            {busy
              ? "Reading Apple Health…"
              : nativeHealth
                ? "Continue to Apple Health"
                : "iPhone app required"}
          </button>
          {healthError && (
            <div className="notice error" role="alert">
              {healthError}
            </div>
          )}
          {health.error && (
            <div className="notice error" role="alert">
              {health.error}
            </div>
          )}
          <details className="help-details">
            <summary>What happens next?</summary>
            <p>
              Apple shows its own permission screen. You can choose exactly
              which categories TrainToday may read and change those choices
              later in Settings → Health → Data Access & Devices.
            </p>
          </details>
          {!demo && data.workouts.length > 0 && (
            <p className="fine-print">
              Apple Health · last synced {activityDate(data.importedAt, now)} ·{" "}
              {data.workouts.length} recent activities
            </p>
          )}
          {demo && nativeHealth && (
            <p className="fine-print">
              You’re currently viewing sample data. Connecting replaces it with
              your recent Apple Health data.
            </p>
          )}
          {!nativeHealth && (
            <div className="web-preview-note">
              <Info size={18} />
              <p>
                Apple’s permission screen is available in the TrainToday iPhone
                app. This website remains a sample preview because Safari and
                home-screen web apps cannot access HealthKit.
              </p>
            </div>
          )}
        </Dialog>
      )}
      {modal === "settings" && (
        <Dialog
          title="Your preferences"
          onClose={() => {
            setModal(null);
            setConfirmClear(false);
          }}
        >
          <div className="setting">
            <div>
              <h3>Distance</h3>
              <p>A unit that feels familiar.</p>
            </div>
            <div className="segmented">
              {(["km", "mi"] as const).map((u) => (
                <button
                  key={u}
                  aria-pressed={state.prefs.units === u}
                  className={state.prefs.units === u ? "active" : ""}
                  onClick={() =>
                    health.update({ prefs: { ...state.prefs, units: u } })
                  }
                >
                  {u === "km" ? "Kilometers" : "Miles"}
                </button>
              ))}
            </div>
          </div>
          <div className="setting vertical">
            <div>
              <h3>Time for today</h3>
              <p>Your plan will fit the time you have.</p>
            </div>
            <div className="segmented">
              {[20, 30, 45, 60].map((n) => (
                <button
                  key={n}
                  aria-pressed={state.prefs.availableMin === n}
                  className={state.prefs.availableMin === n ? "active" : ""}
                  onClick={() =>
                    health.update({
                      prefs: { ...state.prefs, availableMin: n },
                      savedPlan: null,
                    })
                  }
                >
                  {n} min
                </button>
              ))}
            </div>
          </div>
          <button className="settings-row" onClick={() => setModal("data")}>
            <Heart size={18} />
            <span>Health data</span>
            <ChevronRight size={16} />
          </button>
          <div className="data-management">
            <p>
              Health data and preferences are saved on this device. Clearing
              browser storage removes them.
            </p>
            {confirmClear ? (
              <div className="delete-confirm">
                <p>
                  Delete synced activities, check-ins, and saved plans from this
                  device? Apple Health itself is unchanged.
                </p>
                <div className="button-row">
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (health.clear()) {
                        setConfirmClear(false);
                        setModal(null);
                        setToast("Your local health data has been removed.");
                      }
                    }}
                  >
                    Delete local health data
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-button danger"
                onClick={() => setConfirmClear(true)}
              >
                Clear local health data
              </button>
            )}
            {!data.workouts.length && !demo && (
              <button
                className="text-button"
                onClick={() => {
                  if (health.demo()) {
                    setModal(null);
                    setToast("Exploring sample data.");
                  }
                }}
              >
                Explore with sample data
              </button>
            )}
          </div>
        </Dialog>
      )}
      {modal === "log" && (
        <Dialog
          title="Nice work. Make it count."
          onClose={() => setModal(null)}
        >
          <form onSubmit={logSession} className="log-form">
            <p className="dialog-copy">
              Log what you actually did. This stays in TrainToday and isn’t
              written back to Health.
            </p>
            <label>
              Duration in minutes
              <input
                name="minutes"
                type="number"
                min="1"
                max="600"
                required
                defaultValue={rec.durationMin}
              />
            </label>
            {rec.type === "running" && (
              <label>
                Distance in {state.prefs.units} <span>(optional)</span>
                <input
                  name="distance"
                  type="number"
                  min="0"
                  max="200"
                  step="0.01"
                  defaultValue={
                    rec.distanceKm
                      ? distance(rec.distanceKm, state.prefs.units)
                      : ""
                  }
                />
              </label>
            )}
            <label>
              How hard did it feel?
              <select name="effort" defaultValue={String(rec.effort)}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1} / 10
                    {i === 1
                      ? " — very easy"
                      : i === 3
                        ? " — comfortable"
                        : i === 6
                          ? " — hard"
                          : i === 9
                            ? " — maximum"
                            : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit">
              Save completed session <Check size={18} />
            </button>
            {health.error && (
              <p className="notice error" role="alert">
                {health.error}
              </p>
            )}
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog title={selected.title} onClose={() => setSelected(null)}>
          <div className="plan-banner">
            <span>{activityMeta[selected.type].emoji}</span>
            <div>
              <h3>{activityMeta[selected.type].label}</h3>
              <p>{activityDate(selected.start, now)}</p>
            </div>
          </div>
          <div className="workout-details">
            <div>
              <span>Duration</span>
              <b>{Math.round(selected.durationMin)} min</b>
            </div>
            {selected.distanceKm !== undefined && (
              <div>
                <span>Distance</span>
                <b>
                  {distance(selected.distanceKm, state.prefs.units)}{" "}
                  {state.prefs.units}
                </b>
              </div>
            )}
            {selected.heartRate && (
              <div>
                <span>Average heart rate</span>
                <b>{Math.round(selected.heartRate)} bpm</b>
              </div>
            )}
            {selected.effort && (
              <div>
                <span>Perceived effort</span>
                <b>{selected.effort} / 10</b>
              </div>
            )}
          </div>
          <div className="local-note">
            <ShieldCheck size={20} />
            <div>
              <b>{demo ? "Sample activity" : selected.source}</b>
              <p>
                {demo
                  ? "This is example data. Connect Apple Health in the iPhone app to see your own activities."
                  : "Stored on this device. Included in your recent training history."}
              </p>
            </div>
          </div>
          {!demo &&
            new Date(selected.start).getTime() < now.getTime() - 28 * DAY && (
              <p className="fine-print">
                This activity is older than the 28-day recommendation window.
              </p>
            )}
        </Dialog>
      )}
    </div>
  );
}
