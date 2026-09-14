export const DAY = 86400000;
export function dateKey(date: Date | string = new Date()): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayBefore(now: Date, n: number) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}
export function activityDate(start: string, now = new Date()) {
  const d = new Date(start);
  const day =
    dateKey(d) === dateKey(now)
      ? "Today"
      : dateKey(d) === dateKey(dayBefore(now, 1))
        ? "Yesterday"
        : d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
  return `${day} · ${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`;
}
export function distance(km: number, units: "km" | "mi") {
  return (units === "mi" ? km / 1.609344 : km).toFixed(1).replace(/\.0$/, "");
}
export function sleepTime(hours: number) {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
