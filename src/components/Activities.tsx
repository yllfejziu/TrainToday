import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { activityDate, distance } from "../lib/dates";
import { activityMeta, type Workout, type ActivityType } from "../lib/types";
export function ActivityRow({
  workout: w,
  units,
  demo,
  onSelect,
  now,
}: {
  workout: Workout;
  units: "km" | "mi";
  demo: boolean;
  onSelect: (w: Workout) => void;
  now: Date;
}) {
  return (
    <button
      className="activity-row"
      onClick={() => onSelect(w)}
      aria-label={`View ${w.title}`}
    >
      <span className={`activity-emoji ${w.type}`}>
        {activityMeta[w.type].emoji}
      </span>
      <span className="activity-title">
        <b>{w.title}</b>
        <span>{activityDate(w.start, now)}</span>
      </span>
      <span className="activity-number">
        {w.distanceKm
          ? `${distance(w.distanceKm, units)} ${units}`
          : activityMeta[w.type].label.replace(" training", "")}
      </span>
      <span className="activity-number">{Math.round(w.durationMin)} min</span>
      <span className="activity-source">
        {demo ? "Sample activity" : w.source}
      </span>
      <ArrowUpRight size={16} />
    </button>
  );
}
export function ActivityList({
  workouts,
  units,
  demo,
  onSelect,
  now,
}: {
  workouts: Workout[];
  units: "km" | "mi";
  demo: boolean;
  onSelect: (w: Workout) => void;
  now: Date;
}) {
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const list = workouts.filter(
    (w) =>
      (filter === "all" || w.type === filter) &&
      w.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="activity-controls">
        <div className="filters" aria-label="Activity type">
          {(
            [
              "all",
              "running",
              "strength",
              "recovery",
              "cycling",
              "other",
            ] as const
          ).map((t) => (
            <button
              aria-pressed={filter === t}
              key={t}
              className={filter === t ? "active" : ""}
              onClick={() => {
                setFilter(t);
                setLimit(30);
              }}
            >
              {t === "all"
                ? "All activities"
                : activityMeta[t].label.replace(" training", "")}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            type="search"
            placeholder="Find an activity"
            aria-label="Find an activity"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
          />
        </label>
      </div>
      <div className="list-count" aria-live="polite">
        {list.length} {list.length === 1 ? "activity" : "activities"}
        {demo ? " · sample data" : ""}
      </div>
      {list.length ? (
        list
          .slice(0, limit)
          .map((w) => (
            <ActivityRow
              key={w.id}
              workout={w}
              units={units}
              demo={demo}
              onSelect={onSelect}
              now={now}
            />
          ))
      ) : (
        <div className="empty-state">
          <span>👟</span>
          <h3>No activities here yet</h3>
          <p>
            {workouts.length
              ? "Try another activity type or search."
              : "Import health data to see your recent moves here."}
          </p>
        </div>
      )}
      {list.length > limit && (
        <button
          className="secondary-button load-more"
          onClick={() => setLimit((v) => v + 30)}
        >
          Show more activities
        </button>
      )}
    </>
  );
}
